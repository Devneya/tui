import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const app = process.env.DEVNEYA_TEST_APP;
assert(app, 'Set DEVNEYA_TEST_APP to a patched staged installation');
const req=createRequire(join(app,'package.json'));
const root=mkdtempSync(join(tmpdir(),'devneya-patch-test-'));
const tui=join(app,'node_modules/@deepseek-harness-tui/dsh-tui');
process.env.DEVNEYA_TUI_HOME=join(root,'tui');
process.env.DSH_HOME=join(root,'data');
process.env.DSH_TUI_SESSION_ROOT=join(root,'data/sessions');
process.env.DEVNEYA_MANAGED_BUILD='1';
test.after(()=>rmSync(root,{recursive:true,force:true}));
test('managed storage uses owned TUI directory and real home remains intact', async()=>{
 const paths=await import(pathToFileURL(join(tui,'lib/types/utils/paths.js')));
 assert.equal(paths.DATA_DIR,process.env.DEVNEYA_TUI_HOME);assert.equal(paths.homeDir(),homedir());
 const logs=await import(pathToFileURL(join(tui,'lib/types/dsh-adapter/compat/sessionLog.js')));
 assert.deepEqual(logs.sessionsRoots(),[join(root,'data/sessions'),join(root,'tui/sessions')]);
});
test('managed update entry points reject before any fetch or runtime mutation',async()=>{
 const updates=await import(pathToFileURL(join(tui,'lib/types/update.js')));
 let requests=0;const old=globalThis.fetch;globalThis.fetch=()=>{requests++;throw Error('unexpected network');};
 try {
  assert.equal(await updates.checkForTuiUpdate(),undefined);
  for (const name of ['fetchGithubLatestRelease','downloadAndReplaceStandaloneBinary','resolveTuiUpdateTarget','updateTui','updateTuiAndRestart','cliUpdate']) await assert.rejects(async()=>updates[name](),{message:updates.DEVNEYA_UPDATE_MESSAGE});
  for (const name of ['ensureProfileAllowBuilds','ensureWorkspaceAllowBuilds','ensureProfileReleaseAgeExclude','ensureWorkspaceStoreDir','ensureProfileSharpPlatformFilter','removeStalePackageInstall','migrateGlobalLauncher']) assert.throws(()=>updates[name](),{message:updates.DEVNEYA_UPDATE_MESSAGE});
  assert.equal(requests,0);
 } finally { globalThis.fetch=old; }
});
test('managed distribution help describes embedded dependencies and whole releases',async()=>{
 const url=pathToFileURL(join(tui,'lib/types/tips.js'));
 const {TIPS}=await import(url);
 const selected=TIPS.filter(tip=>['cmd-update','pit-update','pit-version-skew','pit-drift','pit-pnpm','pit-safe-mode'].includes(tip.id));
 assert.equal(selected.length,6);assert(selected.every(tip=>!/(?:npm (?:install|i) -g|pnpm|dsh-tui safe|updates the TUI and restarts)/i.test(tip.en)));
 assert.match(selected.find(tip=>tip.id==='pit-pnpm').en,/embedded/);
 try{delete process.env.DEVNEYA_MANAGED_BUILD;url.search='upstream';const stock=await import(url);assert.match(stock.TIPS.find(tip=>tip.id==='pit-pnpm').en,/pnpm 10\+/);}
 finally{process.env.DEVNEYA_MANAGED_BUILD='1';}
});
test('Windows initial defaults are restricted and retain explicit choices',()=>{
 const text=readFileSync(join(tui,'cordis.patch.yml'),'utf8');
 const mode=text.match(/- id: sandbox-policy\n  config:\n    mode: !!js "([^\n]+)"/)[1];
 const approval=text.match(/- id: approval\n  config:\n    policy: !!js "([^\n]+)"/)[1];
 assert.equal(vm.runInNewContext(mode,{process:{platform:'win32',env:{}}}),'workspace-write');
 assert.equal(vm.runInNewContext(approval,{process:{platform:'win32',env:{}}}),'ask');
 assert.equal(vm.runInNewContext(mode,{process:{platform:'win32',env:{DSH_PERMISSION_MODE:'read-only'}}}),'read-only');
 assert.equal(vm.runInNewContext(approval,{process:{platform:'win32',env:{DSH_PERMISSION_MODE:'read-only'}}}),'ask');
});
test('plugin installation returns a normal error without creating any files or spawning a manager',async()=>{
 const operations=await import(pathToFileURL(req.resolve('@deepseek-ai/dsh-plugin-manager/operations')));
 const before=readdirSync(root);let output='';
 const result=await operations.runProfilePnpm({dir:join(root,'nonexistent-profile'),profile:'devneya'},['add','fake-package'],{command:join(root,'must-never-run'),execution:'service',outputBytes:4096,onOutput:text=>{output+=text;}});
 assert.equal(result.exitCode,1);assert.match(output,/Application components are supplied through devneya releases/);
 assert.deepEqual(readdirSync(root),before);assert.equal(existsSync(join(root,'nonexistent-profile')),false);
});
test('bundled workspace manifests name the actual embedded sibling versions',()=>{
 let count=0;
 for(const name of ['command','connection','manifest','messages','presentation','storage']){
  const p=JSON.parse(readFileSync(join(tui,'node_modules/@dsh-std',name,'package.json'),'utf8'));
  for(const [dep,version] of Object.entries(p.dependencies)){assert.equal(version,'0.1.0');assert.equal(JSON.parse(readFileSync(join(tui,'node_modules',dep,'package.json'),'utf8')).version,version);count++;}
 }
 assert.equal(count,10);
});
test('application manifest anchors Chimney in the native RC.2 resolution table without a profile link',async()=>{
 const {initProfile,loadProfile,createRuntimeResolution}=await import(pathToFileURL(req.resolve('@deepseek-ai/dsh-app-boot')));
 const home=join(root,'resolution-home');const dir=join(home,'profiles/devneya');
 initProfile(dir,['@deepseek-ai/dsh-base','@deepseek-harness-tui/dsh-tui']);
 const profile=loadProfile('devneya','devneya',join(app,'package.json'),home);
 assert.equal(profile.skippedBundles.length,0);
 const resolution=await createRuntimeResolution({installAnchor:join(app,'package.json'),profile,home});
 assert(resolution.entries.some(e=>e.name==='@deepseek-harness-tui/dsh-tui'&&e.version==='0.15.0'&&e.scope==='installation'));
 assert.equal(existsSync(join(dir,'node_modules')),false);
});
test('a missing mandatory TUI is a startup error, not an idle successful host',async()=>{
 const {boot}=await import(pathToFileURL(req.resolve('@deepseek-ai/dsh-app-boot')));
 const config=join(root,'empty.cordis.yml');writeFileSync(config,'[]\n');
 await assert.rejects(()=>boot('devneya',config,[]),/mandatory application component dsh-tui is missing or disabled/);
});

test('working activity follows the owned language preference rather than host locale',async()=>{
 mkdirSync(join(root,'tui'),{recursive:true});writeFileSync(join(root,'tui/lang.json'),'{"lang":"en"}');
 process.env.LANG='zh_CN.UTF-8';process.env.LC_ALL='zh_CN.UTF-8';
 const lang=await import(pathToFileURL(join(app,'node_modules/dsh-working-activity/lib/types/lang.js')));
 assert.equal(lang.langNow(),'en');
});
