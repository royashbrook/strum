import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('every eligible deploy validates current main; a late old completion cannot select old code', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.match(workflow, /ref: main/);
  assert.doesNotMatch(workflow, /ref:.*workflow_run\.head_sha/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /jobs:[\s\S]*deploy:[\s\S]*concurrency:/, 'ineligible workflow completions cannot cancel a deploy');
  assert.match(workflow, /- run: npm run check/);
  assert.match(workflow, /- run: npm test/);
  assert.match(workflow, /- run: npm run test:mutations/);
  assert.match(workflow, /- run: npm run test:browser/);
  assert.doesNotMatch(workflow, /- if: github\.event_name == 'workflow_dispatch'/, 'all deploys revalidate the chosen head');
  assert.ok(workflow.indexOf('Refuse a superseded release') > workflow.indexOf('npm run test:browser'));
  assert.ok(workflow.indexOf('npx wrangler deploy') > workflow.indexOf('Refuse a superseded release'));
});

test('local verification and hosted checks exercise the migration mutants', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const workflow = await readFile(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8');
  assert.ok(pkg.scripts.verify.split(' && ').includes('npm run test:mutations'));
  assert.match(workflow, /- run: npm run test:mutations/);
});
