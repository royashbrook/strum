// Deliberate regressions must fail the migration oracle. Never mutate the working tree.
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const cases = [
  ['green window', 'policy.ts', 'IN_TUNE_CENTS = 5', 'IN_TUNE_CENTS = 6'],
  ['ownership margin', 'policy.ts', 'TARGET_MARGIN_CENTS = 30', 'TARGET_MARGIN_CENTS = 28'],
  ['prominence floor', 'analysis.ts', 'prominence < 10 + rejection', 'prominence < 11 + rejection'],
  ['hum hold', 'hum.ts', 'HUM_SETTLE_MS = 2000', 'HUM_SETTLE_MS = 1800'],
  [
    'phase agreement',
    'analysis.ts',
    'Math.min(...estimates)) > 10',
    'Math.min(...estimates)) > 14',
  ],
];
for (const [name, file, before, after] of cases) {
  const scratch = await mkdtemp(resolve(tmpdir(), 'strum-mutation-'));
  try {
    for (const path of ['src', 'tests', 'package.json'])
      await cp(resolve(root, path), resolve(scratch, path), { recursive: true });
    const path = resolve(scratch, 'src/lib', file),
      source = await readFile(path, 'utf8');
    if (!source.includes(before)) throw Error(`Missing mutation anchor: ${name}`);
    await writeFile(path, source.replace(before, after));
    const run = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--test',
        '--test-name-pattern=independent boundary sequences',
        resolve(scratch, 'tests/migration.test.mjs'),
      ],
      { cwd: root, encoding: 'utf8' },
    );
    if (run.status !== 1 || !run.stdout.includes('ERR_ASSERTION'))
      throw Error(`Oracle did not reject ${name}\n${run.stdout}\n${run.stderr}`);
    console.log(`Caught: ${name}`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
