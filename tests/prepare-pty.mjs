// node-pty 1.1.0 publishes its macOS spawn-helper without execute permission.
// Prepare only this locked test dependency; the shipped runtime has its own
// upstream beta package, whose helper is already executable.
import {chmodSync, existsSync, lstatSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import assert from 'node:assert/strict';

if (process.platform === 'darwin') {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve('node-pty/package.json'));
  assert.equal(JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version,'1.1.0');
  const directories = ['build/Release','build/Debug',`prebuilds/darwin-${process.arch}`];
  const native = directories.find(directory => existsSync(join(root,directory,'pty.node')));
  assert(native,'Locked node-pty test native module is missing');
  const helper = join(root,native,'spawn-helper');
  const stat = lstatSync(helper);
  assert(stat.isFile() && !stat.isSymbolicLink(),'Test PTY helper must be a regular file');
  chmodSync(helper,stat.mode | 0o111);
}
