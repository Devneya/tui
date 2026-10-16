import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Screen} from './terminal-screen.mjs';
test('reconstructs incremental redraws and split escape sequences',()=>{
 const s=new Screen(80,24);s.feed('\x1b[2J\x1b[HEnter a route name');s.feed('\x1b[');s.feed('1;7Hthe API key\x1b[K');
 assert.match(s.text(),/^Enter the API key\n/);assert(!s.text().includes('route'));
});
test('handles UTF-8 wide cells, style and OSC title sequences',()=>{
 const s=new Screen(30,4);s.feed('\x1b]0;private title\x07\x1b[31m◈ /provider\x1b[0m\r\nChoose the wire protocol');
 assert(s.text().includes('Choose the wire protocol'));assert(!s.text().includes('private title'));
});
