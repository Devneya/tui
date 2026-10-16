import { Terminal } from './pty.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve('.build/probe-home');mkdirSync(resolve('.build/probe-project'),{recursive:true});
const session=new Terminal(resolve('dist/linux-x64/devneya'),[],{cwd:resolve('.build/probe-project'),env:{...process.env,DEVNEYA_HOME:root,NODE_OPTIONS:'--invalid-inherited-option',NODE_PATH:'/nonexistent',DEEPSEEK_API_KEY:'',LANG:'zh_CN.UTF-8'}});
try{
 await session.ready(true);
 await session.slash('/provider');
 await session.until(/What do you want to do\?|Add a new provider/);
 console.log('Finished executable reached English UI and real provider menu');
 writeFileSync('artifacts/implementation/executable-provider-menu.txt',session.text.replaceAll(resolve('.build'),'<test-root>'));
}finally{await session.close();}
