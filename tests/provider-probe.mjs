import { Terminal } from './pty.mjs';
import { startMockProvider } from './mock-provider.mjs';
import { configureProvider } from './provider-ui.mjs';
import { mkdtempSync,mkdirSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve,join } from 'node:path';
const base=process.env.DEVNEYA_PROBE_ROOT || mkdtempSync(join(tmpdir(),'devneya-provider-'));
const home=join(base,'home');const app=join(base,'app');const cwd=join(base,'project');
mkdirSync(home,{recursive:true});mkdirSync(cwd,{recursive:true});
const provider=await startMockProvider();
const term=new Terminal(resolve('dist/linux-x64/devneya'),[],{cwd,env:{HOME:home,USER:'devneya-test',LOGNAME:'devneya-test',PWD:cwd,PATH:'/usr/bin:/bin',TERM:'xterm-256color',LANG:'en_US.UTF-8',DEVNEYA_HOME:app,NO_PROXY:'127.0.0.1'}});
try{
 await term.ready(true);console.log('Ready');
 await configureProvider(term,provider);console.log('Provider configured through real UI');
 const from=term.mark();await term.enter('Reply with the acceptance marker.');
 await term.until(/DEVNEYA_STREAM_COMPLETE/,60000,from);console.log('Streaming marker received');
 writeFileSync('artifacts/implementation/provider-ui-receipt.json',JSON.stringify({ok:true,requestCount:provider.requests.length,tools:provider.requests.find(r=>r.body?.tools)?.body.tools.map(t=>t.function.name)}));
}catch(error){console.error(error.message);writeFileSync('artifacts/implementation/provider-ui-failure.txt',term.text.replaceAll(base,'<fixture>'));process.exitCode=1;}
finally{await term.close();await provider.close();console.log('Terminal closed',term.exitCode,'fixture',base);}
