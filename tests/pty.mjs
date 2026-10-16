import pty from 'node-pty';
import { Screen } from './terminal-screen.mjs';
import { TerminalReplies } from './terminal-replies.mjs';
import { stripVTControlCharacters } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

export class Terminal {
  constructor(binary, args, {cwd, env, cols=120, rows=40}={}) {
    this.startedAt=Date.now(); this.raw=''; this.text=''; this.screen=new Screen(cols,rows); this.exited=false; this.exitCode=undefined;
    this.child=pty.spawn(binary,args,{name:'xterm-256color',cols,rows,cwd,env});
    this.replies=new TerminalReplies();
    this.child.onData(data=>{
      this.screen.feed(data);
      this.raw=(this.raw+data).slice(-4*1024*1024);
      this.text=(this.text+stripVTControlCharacters(data)).slice(-1024*1024);
      for(const reply of this.replies.feed(data))this.child.write(reply);
    });
    this.closed=new Promise(resolve=>this.child.onExit(event=>{this.exited=true;this.exitCode=event.exitCode;resolve(event);}));
  }
  write(text) { this.child.write(text); }
  mark() { return this.text.length; }
  async until(pattern, timeout=60000, from) {
    const started=Date.now();
    while (Date.now()-started<timeout) {
      if (typeof pattern==='function' ? pattern(this) : (pattern.test(this.screen.text()) || (from!==undefined&&pattern.test(this.text.slice(from))))) return;
      if (this.exited) throw Error(`Terminal exited ${this.exitCode} before readiness: ${this.text.slice(-1200)}`);
      await delay(40);
    }
    throw Error(`Terminal readiness timed out after ${timeout}ms: ${this.text.slice(-1200)}`);
  }
  async enter(text) { this.write(text);await delay(180);this.write('\r');await delay(180); }
  async slash(command) { await this.enter(command);await delay(250);this.write('\r');await delay(180); }
  async ready(first=false) {
    await this.until(/Welcome to dsh-TUI|Say something|type \/|DeepSeek Harness|workspace-write|⌸\s+❯/,first?180000:60000);
    if(/Welcome to dsh-TUI/.test(this.text)&&!/Say something/.test(this.text)) {this.write('\x1b');await this.until(/Say something|type \/|workspace-write/);}
    // The first frame precedes the final raw-input handoff during upstream
    // terminal probing. Include this settling interval in the startup budget.
    await delay(500);
    if(Date.now()-this.startedAt>(first?180000:60000))throw Error('Usable UI exceeded startup readiness deadline');
  }
  resize(cols,rows){this.screen.cols=cols;this.screen.rows=rows;this.child.resize(cols,rows);}
  async close() {
    if(this.exited)return;
    this.write('\x1b');await delay(100);this.write('\x03');await delay(150);this.write('\x03');
    const graceful=await Promise.race([this.closed,delay(5000).then(()=>undefined)]);
    if(!graceful) {this.child.kill();await Promise.race([this.closed,delay(5000)]);}
  }
}
