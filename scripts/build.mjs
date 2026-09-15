import { mkdir, readdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function build(source, target, version) {
  const files = (await readdir(source)).sort();
  const hash = createHash('sha256').update(version);
  for (const file of files) hash.update(file).update(await readFile(resolve(source, file)));
  const id = hash.digest('hex').slice(0, 12), shell = ['/'];
  await mkdir(resolve(target, 'assets', id), { recursive: true });
  for (const file of files) {
    if (file === 'sw.js' || file === 'index.html') continue;
    const destination = /\.(js|css)$/.test(file) ? `assets/${id}/${file}` : file;
    await copyFile(resolve(source, file), resolve(target, destination));
    if (file !== '_headers') shell.push('/' + destination);
  }
  const html = (await readFile(resolve(source, 'index.html'), 'utf8')).replaceAll('BUILD_ID', id).replaceAll('APP_VERSION', version);
  await writeFile(resolve(target, 'index.html'), html);
  const worker = (await readFile(resolve(source, 'sw.js'), 'utf8')).replaceAll('BUILD_ID', id).replace('PRECACHE_ASSETS', JSON.stringify(shell));
  await writeFile(resolve(target, 'sw.js'), worker);
  await writeFile(resolve(target, 'version.json'), JSON.stringify({ version, build: id }));
  return id;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // dist is generated output only; start clean so removed source files cannot ship.
  await rm(resolve('dist'), { recursive: true, force: true });
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  console.log(`Built strum ${version} (${await build(resolve('public'), resolve('dist'), version)})`);
}
