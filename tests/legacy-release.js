import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

// The release people actually installed, not current code wearing an old version string.
export const BASELINE_SHA = '9ca8d5c4011a64d2c34b22f659a82ae4d0f7fc65';
export async function withLegacy(run) {
  const root = await mkdtemp(resolve(tmpdir(), 'strum-baseline-'));
  try {
    const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', BASELINE_SHA, '--', 'public', 'scripts/build.mjs', 'package.json'], { encoding: 'utf8' }).trim().split('\n');
    for (const path of paths) {
      await mkdir(dirname(resolve(root, path)), { recursive: true });
      await writeFile(resolve(root, path), execFileSync('git', ['cat-file', 'blob', BASELINE_SHA + ':' + path]));
    }
    return await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
export async function legacyBuild(target) {
  return withLegacy(async root => {
    const { build } = await import(pathToFileURL(resolve(root, 'scripts/build.mjs')));
    return build(resolve(root, 'public'), target, '0.1.10');
  });
}
