import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build as viteBuild } from 'vite';

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? files(resolve(directory, entry.name)) : resolve(directory, entry.name),
    ),
  );
  return result.flat().sort();
}

export async function build(root, target, version) {
  // Stable source/lockfile identity, not a timestamp that retires identical builds.
  const inputs = [
    ...(await files(resolve(root, 'src'))),
    ...(await files(resolve(root, 'public'))),
    ...[
      'index.html',
      'vite.config.ts',
      'svelte.config.js',
      'package-lock.json',
      'scripts/build.mjs',
    ].map((file) => resolve(root, file)),
  ].sort();
  const hash = createHash('sha256').update(version);
  for (const file of inputs) hash.update(relative(root, file)).update(await readFile(file));
  const id = hash.digest('hex').slice(0, 12);
  const define = { __APP_VERSION__: JSON.stringify(version), __BUILD_ID__: JSON.stringify(id) };
  await viteBuild({
    root,
    configFile: resolve(root, 'vite.config.ts'),
    define,
    logLevel: 'error',
    build: { outDir: target, emptyOutDir: true },
  });
  const shell = (await files(target))
    .map((file) => '/' + relative(target, file).replaceAll('\\', '/'))
    .filter((file) => file !== '/_headers' && !file.endsWith('.map'))
    .map((file) => (file === '/index.html' ? '/' : file));
  await viteBuild({
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'error',
    define: { ...define, __PRECACHE_ASSETS__: JSON.stringify(shell) },
    build: {
      target: 'es2022',
      outDir: target,
      emptyOutDir: false,
      lib: {
        entry: resolve(root, 'src/service-worker.ts'),
        formats: ['iife'],
        name: 'StrumWorker',
        fileName: () => 'sw.js',
      },
      minify: true,
    },
  });
  await writeFile(resolve(target, 'version.json'), JSON.stringify({ version, build: id }));
  return id;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  console.log(`Built strum ${version} (${await build(process.cwd(), resolve('dist'), version)})`);
}
