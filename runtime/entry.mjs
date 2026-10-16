import { mkdirSync, readFileSync, writeFileSync, lstatSync, linkSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Set managed paths before importing any DSH or TUI module. HOME remains real.
process.env.NODE_ENV = 'production';
process.report.excludeNetwork = true;
if (process.platform !== 'win32') process.umask(0o077);
const root = process.env.DEVNEYA_HOME;
const runtime = process.env.DEVNEYA_RUNTIME;
const buildId = process.env.DEVNEYA_BUILD_ID;
for (const [name, value] of Object.entries({ DEVNEYA_HOME: root, DEVNEYA_RUNTIME: runtime })) {
  if (!value || !isAbsolute(value)) throw new Error(`${name} must be an absolute launcher-provided path`);
}
if (!buildId) throw new Error('Missing devneya build identity');
Object.assign(process.env, {
  DEVNEYA_MANAGED_BUILD: '1',
  DSH_HOME: join(root, 'data'),
  DEVNEYA_TUI_HOME: join(root, 'tui'),
  DSH_TUI_BACKEND: 'dsh',
  DSH_TUI_SESSION_ROOT: join(root, 'data', 'sessions'),
  DSH_TUI_HOST_ENTRY_PATH: fileURLToPath(import.meta.url),
  NODE_COMPILE_CACHE: join(root, 'cache', 'node', buildId),
  TMPDIR: join(root, 'cache', 'tmp'), TMP: join(root, 'cache', 'tmp'), TEMP: join(root, 'cache', 'tmp'),
});
delete process.env.NODE_OPTIONS;
delete process.env.NODE_PATH;

function createIfAbsent(path, contents) {
  const temporary = `${path}.init-${process.pid}-${randomUUID()}`;
  try {
    writeFileSync(temporary, contents, { flag: 'wx', mode: 0o600 });
    try { linkSync(temporary, path); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  } finally { try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  const st = lstatSync(path);
  if (!st.isFile() || st.isSymbolicLink()) throw new Error('Managed configuration must be a regular file');
}
for (const path of [join(root, 'tui'), join(root, 'data', 'profiles', 'devneya')]) mkdirSync(path, { recursive: true, mode: 0o700 });
createIfAbsent(join(root, 'tui', 'lang.json'), '{"lang":"en"}\n');
const profileDir = join(root, 'data', 'profiles', 'devneya');
const bundles = ['@deepseek-ai/dsh-base', '@deepseek-harness-tui/dsh-tui'];
// Exact create-if-absent structure from RC.2 initProfile; exclusive writes make
// two concurrent first starts safe without overwriting mutable configuration.
createIfAbsent(join(profileDir, 'package.json'), JSON.stringify({
  name: 'dsh-profile-devneya', private: true, dependencies: {}, dsh: { profile: { bundles } },
}, null, 2) + '\n');
createIfAbsent(join(profileDir, 'cordis.patch.yml'), '[]\n');
createIfAbsent(join(profileDir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n');

try {
  const { loadProfile, createRuntimeResolution } = await import('@deepseek-ai/dsh-app-boot');
  const anchor = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/package.json'));
  const profile = loadProfile('devneya', 'devneya', anchor, process.env.DSH_HOME);
  for (const bundle of bundles) {
    const skipped = profile.skippedBundles.find(item => item.packageName === bundle);
    if (skipped || !profile.layers.some(item => item.packageName === bundle)) {
      throw new Error(`Mandatory bundle ${bundle} failed to load: ${skipped?.reason ?? 'missing from profile'}`);
    }
  }
  if (process.argv[2] === '--devneya-doctor') {
    const resolution = await createRuntimeResolution({ profile, installAnchor: fileURLToPath(new URL('./package.json', import.meta.url)), home: process.env.DSH_HOME });
    const checks = [{ name: 'profile', ok: true }, { name: 'application-resolution', ok: resolution.entries.some(item => item.name === '@deepseek-harness-tui/dsh-tui' && item.version === '0.15.0') }];
    for (const [name, expected] of [['@deepseek-ai/dsh', '0.2.0-rc.2'], ['@deepseek-harness-tui/dsh-tui', '0.15.0']]) {
      const manifest = JSON.parse(readFileSync(fileURLToPath(import.meta.resolve(name + '/package.json')), 'utf8'));
      checks.push({ name, ok: manifest.version === expected });
    }
    const { createRequire } = await import('node:module');
    const req = createRequire(import.meta.url);
    const bootRequire = createRequire(req.resolve('@deepseek-ai/dsh-app-boot'));
    const resolver = await import(bootRequire.resolve('resolve.exports'));
    checks.push({ name: 'resolve.exports/imports', ok: typeof resolver.imports === 'function' });
    await import('@deepseek-harness-tui/dsh-tui');
    for (const name of ['node-pty', 'koffi', 'sharp']) {
      try { const mod = req(name); if (name === 'sharp') await mod({create:{width:1,height:1,channels:3,background:'black'}}).png().toBuffer(); checks.push({ name, ok: true }); }
      catch { checks.push({ name, ok: false, detail: 'Required native module failed to load' }); }
    }
    checks.push({ name: 'bundled-node', ok: process.versions.node === '24.22.0' });
    process.stdout.write(JSON.stringify(checks) + '\n');
  } else {
    const applicationArgs = process.argv.slice(2);
    const entry = join(dirname(anchor), 'lib', 'bin.js');
    process.argv = [process.execPath, entry, '--profile', 'devneya', '--', ...applicationArgs];
    const { runCli } = await import((await import('node:url')).pathToFileURL(entry).href);
    await runCli({ resolvedProfile: { profile, installAnchor: fileURLToPath(new URL('./package.json', import.meta.url)) } });
  }
} catch (error) {
  process.stderr.write(`devneya: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
