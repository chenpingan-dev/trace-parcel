import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { SAMPLE } from '../dist/sample.js';

const cli = resolve('dist/cli.mjs');
const run = (args, cwd) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
test('CLI creates all three formats from the same selected requests', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trace-parcel-test-'));
  try {
    await writeFile(join(dir, 'input.har'), SAMPLE);
    const result = run(
      [
        'input.har',
        '--out',
        'report.html',
        '--har',
        'clean.har',
        '--markdown',
        'issue.md',
        '--only-failed',
        '--lang',
        'zh-CN',
      ],
      dir,
    );
    assert.equal(result.status, 0, result.stderr);
    const har = JSON.parse(await readFile(join(dir, 'clean.har'), 'utf8'));
    assert.deepEqual(
      har.log.entries.map((e) => e.response.status),
      [503, 503, 401],
    );
    for (const name of ['report.html', 'clean.har', 'issue.md'])
      assert.ok(!(await readFile(join(dir, name), 'utf8')).includes('synthetic-session'));
    assert.equal(await readFile(join(dir, 'input.har'), 'utf8'), SAMPLE);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI refuses to overwrite input, existing outputs or duplicate destinations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trace-parcel-test-'));
  try {
    await writeFile(join(dir, 'input.har'), SAMPLE);
    assert.equal(run(['input.har', '--out', 'input.har'], dir).status, 1);
    assert.equal(await readFile(join(dir, 'input.har'), 'utf8'), SAMPLE);
    assert.equal(run(['input.har', '--out', 'same.out', '--har', 'same.out'], dir).status, 1);
    assert.deepEqual((await readdir(dir)).sort(), ['input.har']);
    assert.equal(run(['input.har', '--out', 'report.html', '--unknown'], dir).status, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
