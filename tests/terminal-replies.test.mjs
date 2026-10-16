import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TerminalReplies} from './terminal-replies.mjs';
test('answers each complete DA1 request once across split output chunks',()=>{
  const terminal=new TerminalReplies();
  assert.deepEqual(terminal.feed('frame\x1b['),[]);
  assert.deepEqual(terminal.feed('c\x1b[0c'),['\x1b[?1;2c','\x1b[?1;2c']);
  assert.deepEqual(terminal.feed('next frame'),[]);
});
test('does not claim optional terminal capabilities or answer application text',()=>{
  const terminal=new TerminalReplies();
  assert.deepEqual(terminal.feed('\x1b[?u\x1b[?2026$pDA1 text\x1b[?1;2c'),[]);
  assert.deepEqual(terminal.feed('\x1b[c'),['\x1b[?1;2c']);
});
