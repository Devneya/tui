import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const app = resolve(process.argv[2]);
const req = createRequire(join(app, 'package.json'));
const installed = [];
function visit(modules) {
  for (const entry of readdirSync(modules, {withFileTypes:true})) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    if (entry.name.startsWith('@')) {
      for (const child of readdirSync(join(modules,entry.name), {withFileTypes:true})) if (child.isDirectory()) check(join(modules,entry.name,child.name));
    } else check(join(modules,entry.name));
  }
}
function check(dir) {
  const pkg = JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));
  installed.push({dir,...pkg});
  if (pkg.name?.startsWith('@deepseek-ai/dsh-')) assert.equal(pkg.version,'0.2.0-rc.2',pkg.name);
  try { visit(join(dir,'node_modules')); } catch(error) { if(error.code!=='ENOENT') throw error; }
}
visit(join(app,'node_modules'));
assert.equal(installed.filter(p=>p.name==='@deepseek-ai/cordis').length,1,'Exactly one physical Cordis required');
for(const [name,version] of [['@deepseek-ai/dsh','0.2.0-rc.2'],['@deepseek-harness-tui/dsh-tui','0.15.0']]) assert.equal(installed.find(p=>p.name===name)?.version,version);
assert(!installed.some(p=>p.name==='@anthropic-ai/claude-agent-sdk' || p.name==='@openai/codex'),'Optional proprietary agent CLIs must not ship');
await import(pathToFileURL(req.resolve('@deepseek-ai/dsh-app-boot')));
await import(pathToFileURL(join(app,'node_modules/@deepseek-harness-tui/dsh-tui/lib/types/index.js')));
const boot = createRequire(req.resolve('@deepseek-ai/dsh-app-boot'));
const resolver = boot.resolve('resolve.exports');
const esm = resolver.replace(/index\.js$/, 'index.mjs');
assert.equal(typeof (await import(pathToFileURL(esm))).imports,'function','Exact boot-resolved ESM resolver must export imports');
const pty=req('node-pty');assert.equal(typeof pty.spawn,'function');
const koffi=req('koffi');assert.equal(typeof koffi.load,'function');
await req('sharp')({create:{width:1,height:1,channels:3,background:'black'}}).png().toBuffer();
process.stdout.write(JSON.stringify({ok:true,packages:installed.length,cordisPhysicalInstallations:1,dshVersion:'0.2.0-rc.2',tuiVersion:'0.15.0',nativeModules:['node-pty','koffi','sharp']})+'\n');
