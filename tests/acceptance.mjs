import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,mkdirSync,mkdtempSync,readFileSync,readlinkSync,writeFileSync,readdirSync,existsSync,copyFileSync,chmodSync,renameSync,statSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir,platform,release,arch,userInfo} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {Terminal} from './pty.mjs';
import {startMockProvider,MOCK_API_KEY} from './mock-provider.mjs';
import {configureProvider} from './provider-ui.mjs';

const execute=promisify(execFile);
const flags=Object.fromEntries(process.argv.slice(2).reduce((a,s,i,x)=>{if(s.startsWith('--'))a.push([s.slice(2),x[i+1]]);return a;},[]));
const target=flags.target;assert(target&&flags.directory,'Usage: node tests/acceptance.mjs --target TARGET --directory DIST');
const directory=resolve(flags.directory);const binary=join(directory,process.platform==='win32'?'devneya.exe':'devneya');
const metadata=JSON.parse(readFileSync(join(directory,'build-manifest.json'),'utf8'));
const spec=JSON.parse(readFileSync(new URL('./scenarios.json',import.meta.url),'utf8'));
const config=JSON.parse(readFileSync(new URL('../build.json',import.meta.url),'utf8'));
assert.equal(metadata.target,target);
const temporaryRoot=process.env.DEVNEYA_ACCEPTANCE_TMP?resolve(process.env.DEVNEYA_ACCEPTANCE_TMP):tmpdir();mkdirSync(temporaryRoot,{recursive:true});
const base=mkdtempSync(join(temporaryRoot,'devneya-acceptance-'));const app=join(base,'owned');const home=join(base,'home');const workspace=join(base,'workspace Ω with spaces');const toolbin=join(base,'tools');
for(const d of [home,workspace,toolbin])mkdirSync(d,{recursive:true});
const report={schemaVersion:1,product:'devneya',version:metadata.version,buildId:metadata.buildId,sourceCommit:metadata.sourceCommit,target,os:`${platform()} ${release()} ${arch()}`,runner:{image:process.env.ImageOS??'local',imageVersion:process.env.ImageVersion??'local'},scenarios:[],passed:false,binarySha256:await hash(binary)};
const diagnostics=resolve('artifacts',target);mkdirSync(diagnostics,{recursive:true});
const env={HOME:home,USERPROFILE:home,USER:'devneya-test',LOGNAME:'devneya-test',PWD:workspace,DEVNEYA_HOME:app,TERM:'xterm-256color',COLORTERM:'truecolor',LANG:'zh_CN.UTF-8',LC_ALL:'zh_CN.UTF-8',NO_PROXY:'127.0.0.1,localhost'};
if(process.platform==='win32'){
 env.SystemRoot=process.env.SystemRoot;env.ComSpec=process.env.ComSpec;env.LOCALAPPDATA=join(home,'AppData/Local');
 const allowed=[join(env.SystemRoot,'System32')];
 for(const name of ['pwsh.exe','git.exe','rg.exe']){
  try{
   const {stdout}=await execute(join(env.SystemRoot,'System32/where.exe'),[name]);const folder=dirname(stdout.trim().split(/\r?\n/)[0]);
   if(['node.exe','npm.cmd','npx.cmd','pnpm.cmd','bun.exe','dsh.cmd','nvm.exe'].some(tool=>existsSync(join(folder,tool))))throw Error('External tool directory also exposes an application runtime');
   allowed.push(folder);
  }catch(error){if(name==='pwsh.exe')throw error;}
 }
 env.PATH=[...new Set(allowed)].join(';');
}else{
 for(const name of ['bash','sh','git','rg','ps','uname','env','printf','cat','pwd','true','false','sleep','echo']){
  try{const {stdout}=await execute('/usr/bin/which',[name]);symlinkSync(stdout.trim(),join(toolbin,name));}catch(error){if(['bash','sh'].includes(name))throw error;}
 }
 env.PATH=toolbin;
}
// Give the disposable workspace its own project boundary even when a local
// caller puts fixture storage beneath a source checkout. Parent repositories
// must not broaden workspace-write during approval tests.
await execute('git',['-C',workspace,'init','--quiet','--template='],{env:{...process.env,HOME:home,USERPROFILE:home,GIT_CONFIG_NOSYSTEM:'1'}});
let terminal;let provider;let doctor;let failure;
const recorded=new Set();
function redact(text){return String(text).replaceAll(base,'<fixture>').replaceAll(MOCK_API_KEY,'<fake-key>').replaceAll(directory,'<candidate>').replaceAll(resolve('.'),'<source>');}
function saveReport(){report.passed=report.scenarios.length===Object.keys(spec).length+(target==='windows-x64'?1:0)&&report.scenarios.every(r=>r.pass);writeFileSync(join(directory,'acceptance-report.json'),JSON.stringify(report,null,2)+'\n');}
async function hash(file){const sum=createHash('sha256');for await(const b of createReadStream(file))sum.update(b);return sum.digest('hex');}
async function record(name,fn){
 const started=Date.now();let actual='';let passed=false;
 try{actual=await fn()||'Expected behavior observed against the finished executable';passed=true;}
 catch(error){actual=redact(error.message);failure??=error;writeFileSync(join(diagnostics,name+'-error.txt'),redact(error.stack));if(terminal)writeFileSync(join(diagnostics,name+'.txt'),redact(terminal.screen.text()));}
 report.scenarios.push({buildId:metadata.buildId,sourceCommit:metadata.sourceCommit,target,os:report.os,scenario:name,expectedResult:spec[name]??'Standard-user bootstrap succeeds independently of administrator ConPTY tests',actualResult:actual,pass:passed,durationMs:Date.now()-started,diagnosticArtifacts:passed?[]:[`artifacts/${target}/${name}.txt`]});recorded.add(name);saveReport();console.log(`${passed?'PASS':'FAIL'} ${name}: ${passed?'verified':actual}`);
 return passed;
}
async function command(args,extraEnv={},timeout=60000){return execute(binary,args,{cwd:workspace,env:{...env,...extraEnv},timeout,maxBuffer:16*1024*1024});}
process.once('SIGTERM',async()=>{await quit();if(provider)await provider.close();saveReport();process.exit(1);});
async function open(args=[],extraEnv={},first=false){const t=new Terminal(binary,args,{cwd:workspace,env:{...env,...extraEnv}});terminal=t;await t.ready(first);return t;}
async function quit(){if(!terminal)return;const t=terminal;t.write('\x1b');await delay(150);await t.enter('/exit');await Promise.race([t.closed,delay(5000)]);if(!t.exited)await t.close();terminal=undefined;return t;}
async function wait(predicate,timeout=60000){const start=Date.now();while(Date.now()-start<timeout){if(predicate())return;await delay(40);}throw Error('Acceptance condition timed out');}
async function ownedProcesses(){
 const prefix=join(app,'runtime');
 if(process.platform==='linux')return readdirSync('/proc').filter(pid=>/^\d+$/.test(pid)).filter(pid=>{try{return readlinkSync('/proc/'+pid+'/exe').startsWith(prefix+'/');}catch{return false;}}).map(Number);
 if(process.platform==='darwin'){const {stdout}=await execute('/bin/ps',['-axo','pid=,comm=']);return stdout.split('\n').flatMap(line=>{const match=/^\s*(\d+)\s+(.+)$/.exec(line);return match&&match[2].startsWith(prefix+'/')?[Number(match[1])]:[];});}
 const script="Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($env:DEVNEYA_OWNED_PREFIX, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { $_.ProcessId }";
 const {stdout}=await execute('pwsh',['-NoProfile','-Command',script],{env:{...process.env,DEVNEYA_OWNED_PREFIX:prefix+'\\'}});return stdout.trim().split(/\s+/).filter(Boolean).map(Number);
}
async function assertNoOwnedProcesses(){const started=Date.now();while(Date.now()-started<10000){if(!(await ownedProcesses()).length)return;await delay(100);}assert.deepEqual(await ownedProcesses(),[],'Application workers remained after exit');}
function queueResponse(prompt,fn){const responder=r=>{const user=r.body?.messages?.filter(m=>m.role==='user').map(m=>m.content);if(!r.body?.tools?.length||!JSON.stringify(user).includes(prompt)){provider.setScenario(responder);return undefined;}return fn(r);};provider.setScenario(responder);}
function toolResponse(request,name,args){const tool=request.body.tools.find(t=>t.function?.name===name);assert(tool,`Expected advertised tool ${name} is missing`);const schema=tool.function.parameters;for(const key of schema.required??[])assert(Object.hasOwn(args,key),`${name} missing required ${key}`);for(const [key,value] of Object.entries(args)){assert(schema.properties?.[key],`${name} unknown argument ${key}`);if(schema.properties[key].enum)assert(schema.properties[key].enum.includes(value),`${name} invalid enum ${key}`);}return {choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'call_devneya_acceptance_'+Date.now(),type:'function',function:{name,arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'}]};}
function completion(text){return {choices:[{message:{role:'assistant',content:text},finish_reason:'stop'}]};}
async function turn(prompt,fn){
 const index=provider.requests.length;const mark=terminal.mark();const marker=prompt+'_DEVNEYA_STREAM_COMPLETE';
 queueResponse(prompt,r=>{if(fn){const response=fn(r);queueResponse(prompt,()=>completion(marker));return response;}return completion(marker);});
 await terminal.enter(prompt);await terminal.until(new RegExp(marker),60000,mark);
 await delay(200);await terminal.until(t=>!t.screen.text().toLowerCase().includes('esc to interrupt'));
 return provider.requests.slice(index);
}
function resultText(requests){return JSON.stringify(requests.flatMap(r=>r.body?.messages?.filter(m=>m.role==='tool')??[]));}
function currentSessionId(){const mounts=JSON.parse(readFileSync(join(app,'tui/session-mounts.json'),'utf8'));const ids=[...new Set(mounts.owners.flatMap(owner=>owner.sessionIds))];assert.equal(ids.length,1,'One mounted main session expected');return ids[0];}
async function approveOnce(){
 await terminal.until(t=>/Allow this operation\?|Awaiting approval/.test(t.screen.text())&&/Yes, allow once/.test(t.screen.text()));
 const lines=terminal.screen.text().split('\n');const yes=lines.findIndex(line=>line.includes('Yes, allow once'));const selected=lines.findIndex(line=>line.includes('❯')&&(line.includes('Yes, allow once')||/No/.test(line)));assert(yes>=0&&selected>=0,'Approval options must be visible');
 if(yes!==selected){terminal.write(yes>selected?'\x1b[B':'\x1b[A');await delay(150);}terminal.write('\r');
}
function patchReader(){return createRequire(join(doctor.runtimeRoot,'app/package.json'))('yaml');}
function loadPatches(){return patchReader().parse(readFileSync(join(app,'data/profiles/devneya/cordis.patch.yml'),'utf8'));}
function writePatches(rows){writeFileSync(join(app,'data/profiles/devneya/cordis.patch.yml'),JSON.stringify(rows,null,2)+'\n',{mode:0o600});}

try{
 await record('cold-offline-launch',async()=>{
  let t;let container;const name='devneya-acceptance-'+randomUUID();
  if(process.platform==='linux'){
   container=process.env.DEVNEYA_CONTAINER_ENGINE||'/usr/bin/docker';
   try{
    t=new Terminal(container,['run','--rm','--name',name,'--network','none','--user','1000:1000','-it','--workdir','/tmp','-e','HOME=/tmp/test-home','-e','DEVNEYA_HOME=/tmp/devneya','-e','LANG=zh_CN.UTF-8','-v',directory+':/candidate:ro',config.linuxAcceptanceImages[target],'/candidate/devneya'],{cwd:workspace,env:process.env});
    await t.ready(true);assert.match(t.text,/Welcome to dsh-TUI|Say something/);t.write('/provider');await delay(250);t.write('\r');await t.until(/What do you want to do/);return 'Fresh non-root Ubuntu 22.04 container reached English provider UI in its own disabled-network namespace; no Node or package manager installed';
   }finally{if(t)await t.close();await execute(container,['rm','--force',name]).catch(()=>{});}
  }else if(process.platform==='darwin'){
   t=new Terminal('/usr/bin/sandbox-exec',['-p','(version 1)(allow default)(deny network-outbound)',binary],{cwd:workspace,env:{...env,DEVNEYA_HOME:join(base,'offline')}});try{await t.ready(true);return 'Cold first UI reached with process sandbox denying outbound networking';}finally{await t.close();}
  }else{
   const offline=join(base,'offline');const fw=resolve('scripts/windows_firewall.ps1');
   try{await execute('pwsh',['-NoProfile','-File',fw,'-Mode','add','-RulePrefix',name,'-Candidate',binary,'-Node',join(offline,'runtime',metadata.buildId,'bin/node.exe')]);t=new Terminal(binary,[],{cwd:workspace,env:{...env,DEVNEYA_HOME:offline}});await t.ready(true);return 'Cold first UI reached with candidate-specific and extracted-Node firewall blocks';}
   finally{if(t)await t.close();await execute('pwsh',['-NoProfile','-File',fw,'-Mode','remove','-RulePrefix',name]);}
  }
 });
 await record('version-help',async()=>{
  const separate=join(base,'never-initialized');for(const arg of ['--version','--help']){const {stdout}=await command([arg],{DEVNEYA_HOME:separate});assert(stdout.includes('devneya'));if(arg==='--version')for(const v of ['0.1.0','24.22.0','0.2.0-rc.2','0.15.0',metadata.buildId])assert(stdout.includes(v));}
  assert(!existsSync(separate));try{await command(['--unknown']);assert.fail('Unknown argument was accepted');}catch(e){assert.equal(e.code,2);}
 });
 const fresh=await record('fresh-application-root',async()=>{await open([],{},true);assert(existsSync(join(app,'data/profiles/devneya/package.json')));assert(!existsSync(join(app,'data/profiles/devneya/node_modules')));});
 if(!fresh)throw failure;
 await record('no-system-runtime',async()=>{assert(!existsSync(join(toolbin,'node')));assert(!existsSync(join(toolbin,'npm')));assert(!terminal.exited);doctor=JSON.parse((await command(['doctor','--json'])).stdout);assert(doctor.checks.every(c=>c.ok));});
 await record('english-default',async()=>{assert.equal(JSON.parse(readFileSync(join(app,'tui/lang.json'),'utf8')).lang,'en');assert.match(terminal.text,/Welcome to dsh-TUI|Say something/);});
 await record('storage-isolation',async()=>{
  for(const dir of ['.dsh','.dsh-tui']){mkdirSync(join(home,dir),{recursive:true});writeFileSync(join(home,dir,'unrelated-fixture'),'unchanged');}
  assert.equal(JSON.parse(readFileSync(join(app,'data/profiles/devneya/package.json'),'utf8')).dsh.profile.bundles.join(','),'@deepseek-ai/dsh-base,@deepseek-harness-tui/dsh-tui');
  for(const dir of ['.dsh','.dsh-tui'])assert.deepEqual(readdirSync(join(home,dir)),['unrelated-fixture']);
 });
 provider=await startMockProvider();
 const configured=await record('custom-provider',async()=>{await configureProvider(terminal,provider);assert.equal(JSON.parse(readFileSync(join(app,'tui/model.json'),'utf8')).provider,'devneya-ci');assert(!env.DEEPSEEK_API_KEY);if(process.platform!=='win32')assert.equal(statSync(join(app,'data/.credentials.yaml')).mode&0o777,0o600);});
 if(!configured)throw failure;
 // Use the backend's actual default-model fields for deterministic child
 // sessions, after proving the real provider UI works without a DeepSeek key.
 await quit();const configuredPatches=loadPatches();
 configuredPatches.push({id:'agent-default-model',config:{provider:'devneya-ci',model:'devneya-test'}});
 configuredPatches.find(r=>r.id==='llm-pi-ai').config.providers['devneya-ci'].retryPolicy={mode:'normal',maxRetries:0};
 writePatches(configuredPatches);await open();

 await record('streaming',async()=>{const requests=await turn('DEVNEYA_ACCEPT_STREAM');assert(requests.some(r=>r.path==='/v1/chat/completions'&&r.body.stream===true));const tools=requests.find(r=>r.body?.tools?.length)?.body.tools;assert(tools);writeFileSync(join(diagnostics,'advertised-tools.json'),redact(JSON.stringify(tools,null,2)));});
 await record('authentication-failures',async()=>{
  for(const [prompt,scenario,pattern] of [['DEVNEYA_AUTH_BADKEY','unauthorized',/Mock provider rejected|401|invalid_api_key/],['DEVNEYA_AUTH_BADMODEL','unknown-model',/was not found|404|model_not_found/]]){
   queueResponse(prompt,()=>scenario);const index=provider.requests.length;await terminal.enter(prompt);await wait(()=>provider.requests.slice(index).some(r=>r.body?.tools?.length));await terminal.until(pattern);assert(!terminal.exited);await turn(prompt+'_RECOVER');
  }
  await quit();const original=readFileSync(join(app,'data/profiles/devneya/cordis.patch.yml'),'utf8');
  const patches=loadPatches();patches.find(r=>r.id==='llm-pi-ai').config.providers['devneya-ci'].baseURL='http://127.0.0.1:1/v1';writePatches(patches);
  try{await open();await terminal.enter('DEVNEYA_UNREACHABLE');await terminal.until(/ECONNREFUSED|fetch failed|connection (?:refused|error)|Unable to connect|Cannot connect|TRANSPORT/i);assert(!terminal.exited);}
  catch(error){writeFileSync(join(diagnostics,'unreachable-endpoint.txt'),redact(terminal?.screen.text()??''));throw Error('Unreachable endpoint recovery: '+error.message,{cause:error});}
  finally{await quit();writeFileSync(join(app,'data/profiles/devneya/cordis.patch.yml'),original,{mode:0o600});await open();}
  await turn('DEVNEYA_ENDPOINT_RECOVER');
 });
 await record('file-operations',async()=>{
  const file=join(workspace,'acceptance.txt');
  await turn('DEVNEYA_ACCEPT_CREATE',r=>toolResponse(r,'write',{file_path:file,content:'before\n'}));assert.equal(readFileSync(file,'utf8'),'before\n');
  const reads=await turn('DEVNEYA_ACCEPT_READ',r=>toolResponse(r,'read',{file_path:file}));assert(resultText(reads).includes('before'));
  await turn('DEVNEYA_ACCEPT_EDIT',r=>toolResponse(r,'edit',{file_path:file,old_string:'before',new_string:'after'}));assert.equal(readFileSync(file,'utf8'),'after\n');
  const verify=await turn('DEVNEYA_ACCEPT_VERIFY',r=>toolResponse(r,'read',{file_path:file}));assert(resultText(verify).includes('after'));
 });
 await record('shell-operation',async()=>{const shell=process.platform==='win32'?'pwsh':'bash';const command=process.platform==='win32'?"Write-Output 'DEVNEYA_SHELL_OK'; exit 7":"printf 'DEVNEYA_SHELL_OK\\n'; exit 7";const requests=await turn('DEVNEYA_ACCEPT_SHELL',r=>toolResponse(r,shell,{command,description:'Run a harmless command and verify exit status seven'}));assert(resultText(requests).includes('DEVNEYA_SHELL_OK'));assert.match(resultText(requests),/exit[^\n]{0,60}7|exit_code[^\n]{0,20}7|code[^\n]{0,20}7/i);});
 await record('approval-allow-deny',async()=>{
  for(const allowed of [false,true]){
   const file=resolve('.build',`approval-${allowed?'allow':'deny'}-${randomUUID()}.txt`);const prompt=allowed?'DEVNEYA_APPROVE_ALLOW':'DEVNEYA_APPROVE_DENY';const marker=prompt+'_DEVNEYA_STREAM_COMPLETE';
   queueResponse(prompt,r=>{const response=toolResponse(r,'write',{file_path:file,content:'explicit approval only'});queueResponse(prompt,retry=>{assert.match(resultText([retry]),/denied|workspace-write|sandbox/i,'A real sandbox denial must precede escalation');queueResponse(prompt,()=>completion(marker));return toolResponse(retry,'write',{file_path:file,content:'explicit approval only',sandbox_permissions:'danger-full-access',justification:'Acceptance test requests one explicitly approved write outside its workspace after a denial'});});return response;});
   await terminal.enter(prompt);await terminal.until(/Allow this operation\?|Awaiting approval/,60000);
   if(allowed)await approveOnce();else terminal.write('\x1b');
   await terminal.until(new RegExp(marker));assert.equal(existsSync(file),allowed);if(allowed)rmSync(file);
  }
 });
 await record('ptc-workers',async()=>{
  await quit();await open([],{DSH_TUI_PRESET:'ptc'});
  try{
   const requests=await turn('DEVNEYA_ACCEPT_PTC',r=>toolResponse(r,'run_code',{code:"console.log('DEVNEYA_PTC_OK '+process.execPath);",description:'Verify real PTC worker and bundled Node'}));
   const text=resultText(requests);assert(text.includes('DEVNEYA_PTC_OK'));assert(text.includes(join(doctor.runtimeRoot,'bin',process.platform==='win32'?'node.exe':'node')));
  }finally{await quit();writeFileSync(join(app,'tui/agent-preset.json'),'{"preset":"standard"}');await open([],{DSH_TUI_PRESET:'standard'});}
 });
 await record('subagents',async()=>{
  const requests=await turn('DEVNEYA_ACCEPT_CHILD',r=>toolResponse(r,'subagent',{description:'Complete deterministic child turn',prompt:'DEVNEYA_CHILD_TURN: reply with DEVNEYA_CHILD_COMPLETE',run_in_background:false}));
  assert(provider.requests.some(r=>JSON.stringify(r.body?.messages??[]).includes('DEVNEYA_CHILD_TURN')));assert(resultText(requests).includes('DEVNEYA_STREAM_COMPLETE')||resultText(requests).includes('DEVNEYA_MOCK_COMPLETE'));
 });
 await record('package-installation',async()=>{
  await quit();const manifestPath=join(app,'data/profiles/devneya/package.json');const before=await hash(manifestPath);const lock=await hash(join(doctor.runtimeRoot,'app/package-lock.json'));const original=readFileSync(join(app,'data/profiles/devneya/cordis.patch.yml'),'utf8');
  const rows=loadPatches();rows.push({id:'tool-plugin-manager',disabled:false});writePatches(rows);await open();
  try{
   const prompt='DEVNEYA_PACKAGE_INSTALL';const marker=prompt+'_DEVNEYA_STREAM_COMPLETE';const index=provider.requests.length;
   queueResponse(prompt,r=>{const response=toolResponse(r,'plugin_manager',{action:'install_bundle',target:'devneya-must-not-install'});queueResponse(prompt,()=>completion(marker));return response;});
   await terminal.enter(prompt);await approveOnce();await terminal.until(new RegExp(marker));const requests=provider.requests.slice(index);assert.match(resultText(requests),/Application components are supplied through devneya releases/);
   assert.equal(await hash(manifestPath),before);assert.equal(await hash(join(doctor.runtimeRoot,'app/package-lock.json')),lock);assert(!terminal.exited);await turn('DEVNEYA_AFTER_PACKAGE_REJECTION');
  }finally{await quit();writeFileSync(join(app,'data/profiles/devneya/cordis.patch.yml'),original,{mode:0o600});await open();}
 });
 await record('managed-updates',async()=>{const before=await hash(join(doctor.runtimeRoot,'app/package-lock.json'));const mark=terminal.mark();terminal.write('/update');await delay(250);terminal.write('\r');await terminal.until(/This devneya build is updated as a whole|github.com\/Devneya\/tui\/releases/,60000,mark);assert(!terminal.exited);assert.equal(await hash(join(doctor.runtimeRoot,'app/package-lock.json')),before);await turn('DEVNEYA_AFTER_UPDATE');});
 await record('native-modules',async()=>{assert(doctor.checks.filter(c=>['node-pty','koffi','sharp','bundled-node'].includes(c.name)).length===4);assert(doctor.checks.every(c=>c.ok));});
 await record('persistence',async()=>{const model=readFileSync(join(app,'tui/model.json'),'utf8');const credentials=await hash(join(app,'data/.credentials.yaml'));await quit();await open();assert.equal(readFileSync(join(app,'tui/model.json'),'utf8'),model);assert.equal(await hash(join(app,'data/.credentials.yaml')),credentials);await turn('DEVNEYA_PERSISTED');});
 await record('resume',async()=>{
  const sessionId=currentSessionId();assert(sessionId);await quit();await open(['--resume',sessionId]);assert.equal(currentSessionId(),sessionId);
  const requests=await turn('DEVNEYA_RESUMED');assert(requests.some(r=>JSON.stringify(r.body?.messages??[]).includes('DEVNEYA_PERSISTED')));
  terminal.write('/resume');await delay(250);terminal.write('\r');await terminal.until(/This terminal hosts several sessions|Type to search sessions|Workspaces.*History/);terminal.write('\x1b');await delay(250);await turn('DEVNEYA_SESSION_BROWSER');
 });
 await record('restart',async()=>{
  const sessionId=currentSessionId();const oldOwner=JSON.parse(readFileSync(join(app,'tui/session-mounts.json'),'utf8')).owners[0].pid;
  terminal.write('/restart');await delay(250);terminal.write('\r');
  await wait(()=>{try{return JSON.parse(readFileSync(join(app,'tui/session-mounts.json'),'utf8')).owners.some(o=>o.pid!==oldOwner&&o.sessionIds.includes(sessionId));}catch{return false;}},60000);
  await delay(750);await turn('DEVNEYA_RESTART_KEYBOARD');assert.equal(currentSessionId(),sessionId);
 });
 await record('terminal-behavior',async()=>{
  terminal.resize(100,32);await delay(200);terminal.resize(120,40);queueResponse('DEVNEYA_UNICODE',()=>completion('DEVNEYA_UNICODE_DONE'));
  terminal.write('\x1b[200~DEVNEYA_UNICODE Ω 😀\nsecond line\x1b[201~');await terminal.until(t=>t.screen.text().includes('DEVNEYA_UNICODE')&&t.screen.text().includes('second line'));await delay(200);terminal.write('\r');await terminal.until(/DEVNEYA_UNICODE_DONE/);assert(provider.requests.some(r=>JSON.stringify(r.body??{}).includes('DEVNEYA_UNICODE Ω 😀\\nsecond line')));
  await terminal.until(t=>!t.screen.text().toLowerCase().includes('esc to interrupt'));terminal.write('\x03');await delay(150);assert(!terminal.exited);await delay(2500);
  terminal.write('\x04');await delay(150);assert(!terminal.exited,'First EOF must arm the upstream exit confirmation');terminal.write('\x04');await Promise.race([terminal.closed,delay(10000)]);assert(terminal.exited,'Confirmed EOF must exit');await assertNoOwnedProcesses();terminal=undefined;await open();
 });
 await record('exit-failure',async()=>{
  const t=await quit();assert(t.exited);assert.equal(t.exitCode,0);assert.match(t.raw,/\x1b\[\?25h/);assert.match(t.raw,/\x1b\[\?1049l/);await assertNoOwnedProcesses();
  const broken=new Terminal(binary,['--cwd',join(base,'missing-workspace')],{cwd:workspace,env});await Promise.race([broken.closed,delay(60000)]);assert(broken.exited);assert.equal(broken.exitCode,1);assert.match(broken.text,/workspace must be an accessible directory/);assert(!broken.raw.includes('\x1b[?1049h'),'Failed startup must leave the terminal untouched');await assertNoOwnedProcesses();
 });
 await record('contaminated-environment',async()=>{const log=join(base,'stub-ran');const stubs=join(base,'broken runtimes');mkdirSync(stubs);if(process.platform!=='win32')for(const name of ['node','npm','npx','pnpm','bun','dsh']){writeFileSync(join(stubs,name),`#!/bin/sh\nprintf ran >> '${log}'\nexit 99\n`,{mode:0o755});}await open([],{PATH:stubs+(process.platform==='win32'?';':':')+env.PATH,NODE_OPTIONS:'--this-option-does-not-exist',NODE_PATH:stubs,DSH_HOME:join(home,'.dsh'),DEVNEYA_TUI_HOME:join(home,'.dsh-tui')});await turn('DEVNEYA_CONTAMINATED');await quit();assert(!existsSync(log));for(const dir of ['.dsh','.dsh-tui'])assert.equal(readFileSync(join(home,dir,'unrelated-fixture'),'utf8'),'unchanged');});
 await record('corruption-recovery',async()=>{const credentials=await hash(join(app,'data/.credentials.yaml'));const model=readFileSync(join(app,'tui/model.json'),'utf8');const entry=join(doctor.runtimeRoot,'app/entry.mjs');writeFileSync(entry,'corrupt');assert(JSON.parse((await command(['doctor','--json'],{},180000)).stdout).checks.every(c=>c.ok));rmSync(entry);assert(JSON.parse((await command(['doctor','--json'],{},180000)).stdout).checks.every(c=>c.ok));await command(['repair'],{},180000);assert.equal(await hash(join(app,'data/.credentials.yaml')),credentials);assert.equal(readFileSync(join(app,'tui/model.json'),'utf8'),model);});
 await record('concurrency',async()=>{
  const shared=join(base,'concurrent');const a=new Terminal(binary,[],{cwd:workspace,env:{...env,DEVNEYA_HOME:shared}});const b=new Terminal(binary,[],{cwd:workspace,env:{...env,DEVNEYA_HOME:shared}});
  try{await Promise.all([a.ready(true),b.ready(true)]);assert(!a.exited&&!b.exited);const record=JSON.parse(readFileSync(join(shared,'runtime',metadata.buildId,'.devneya-complete.json'),'utf8'));assert.equal(record.identity,metadata.fullIdentity);JSON.parse(readFileSync(join(shared,'data/profiles/devneya/package.json'),'utf8'));}
  finally{await Promise.all([a.close(),b.close()]);}
 });
 await record('interrupted-extraction',async()=>{
  const interrupted=join(base,'interrupted');mkdirSync(interrupted);writeFileSync(join(interrupted,'ownership.json'),'{"schemaVersion":1,"product":"devneya"}');mkdirSync(join(interrupted,'data'));writeFileSync(join(interrupted,'data','preserve'),'user fixture');
  const child=spawn(binary,['doctor','--json'],{cwd:workspace,env:{...env,DEVNEYA_HOME:interrupted},stdio:'ignore'});const exited=new Promise(resolve=>child.once('exit',resolve));
  await wait(()=>existsSync(join(interrupted,'runtime'))&&readdirSync(join(interrupted,'runtime')).some(n=>n.startsWith('.staging-')),60000);child.kill('SIGKILL');await exited;
  const report=JSON.parse((await command(['doctor','--json'],{DEVNEYA_HOME:interrupted},180000)).stdout);assert(report.checks.every(c=>c.ok));assert.equal(readFileSync(join(interrupted,'data','preserve'),'utf8'),'user fixture');
 });
 await record('rollback',async()=>{
  const baseline=flags['rollback-binary']||process.env.DEVNEYA_ROLLBACK_BINARY;assert(baseline,'A second build of the same data-compatible baseline is required for rollback qualification');
  const version=await execute(resolve(baseline),['--version'],{env:{...env,DEVNEYA_HOME:join(base,'version-only')},cwd:workspace});for(const v of ['DSH 0.2.0-rc.2','Chimney 0.15.0'])assert(version.stdout.includes(v));assert(!version.stdout.includes('build '+metadata.buildId),'Rollback must use a different build identity');
  const model=readFileSync(join(app,'tui/model.json'),'utf8');const credentials=await hash(join(app,'data/.credentials.yaml'));
  terminal=new Terminal(resolve(baseline),[],{cwd:workspace,env});
  // The alternate executable has a different build identity and must perform
  // its first extraction. Warm starts of already extracted builds retain 60s.
  await terminal.ready(true);await turn('DEVNEYA_ROLLBACK');await quit();
  assert.equal(readFileSync(join(app,'tui/model.json'),'utf8'),model);assert.equal(await hash(join(app,'data/.credentials.yaml')),credentials);
  await open();await turn('DEVNEYA_ROLL_FORWARD');await quit();
 });
 await record('relocation',async()=>{await quit();const moved=join(base,'relocated Ω with spaces');mkdirSync(moved);const path=join(moved,process.platform==='win32'?'devneya.exe':'devneya');copyFileSync(binary,path);if(process.platform!=='win32')chmodSync(path,0o755);const t=new Terminal(path,[],{cwd:workspace,env});terminal=t;await t.ready();await turn('DEVNEYA_RELOCATED');await quit();assert.deepEqual(readdirSync(moved),[process.platform==='win32'?'devneya.exe':'devneya']);});
 if(target==='windows-x64')await record('standard-user-bootstrap',async()=>{const output=await execute('pwsh',['-NoProfile','-File',resolve('scripts/windows_standard_user.ps1'),'-Candidate',binary],{timeout:240000,maxBuffer:1024*1024});assert(JSON.parse(output.stdout).ok);});
 await record('permissions',async()=>{
  const marker=join(home,'ownership.json');writeFileSync(marker,'{"schemaVersion":1,"product":"devneya"}');
  const homeAlias=join(dirname(home),'HOME');const homes=[home];if(existsSync(homeAlias)&&statSync(homeAlias).ino===statSync(home).ino)homes.push(homeAlias);
  for(const root of homes)await assert.rejects(command(['doctor'],{DEVNEYA_HOME:root}),error=>error.code===1&&/home|unsafe/i.test(error.stderr));
  if(process.platform!=='win32')assert.notEqual(userInfo().uid,0,'Standard user required');const bad=join(base,'not-a-directory');writeFileSync(bad,'unchanged');try{await command(['doctor'],{DEVNEYA_HOME:bad});assert.fail('Invalid root accepted');}catch(e){assert.equal(e.code,1);}assert.equal(readFileSync(bad,'utf8'),'unchanged');
  const unwritable=join(base,'unwritable');mkdirSync(unwritable);if(process.platform==='win32'){await execute('icacls',[unwritable,'/deny',`${userInfo().username}:(W)`]);}else chmodSync(unwritable,0o500);
  try{await assert.rejects(command(['doctor'],{DEVNEYA_HOME:join(unwritable,'devneya')}),error=>error.code===1&&/devneya:/i.test(error.stderr));}
  finally{if(process.platform==='win32')await execute('icacls',[unwritable,'/remove:d',userInfo().username]);else chmodSync(unwritable,0o700);}
 });
}catch(error){failure??=error;console.error(redact(error.message));}
finally{
 await quit();if(provider)await provider.close();
 for(const [name,expected] of Object.entries(spec))if(!recorded.has(name))await record(name,()=>{throw Error('Required acceptance not yet executed; release remains blocked');});
 if(target==='windows-x64'&&!recorded.has('standard-user-bootstrap'))await record('standard-user-bootstrap',()=>{throw Error('Standard-user Windows bootstrap has not been qualified');});
 saveReport();console.log(`Acceptance: ${report.scenarios.filter(s=>s.pass).length}/${report.scenarios.length} passed`);
 // This mkdtemp tree contains only generated workspaces and fake credentials.
 // Sanitized receipts/diagnostics have already been written outside it.
 const owned=await ownedProcesses();if(owned.length){report.passed=false;saveReport();console.error('Owned test processes remain; retaining their fixture for diagnosis');}else rmSync(base,{recursive:true,force:true});
 if(!report.passed)process.exitCode=1;
}
