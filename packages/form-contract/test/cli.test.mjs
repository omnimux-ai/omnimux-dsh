import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, cpSync, readdirSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageRoot, generatedFiles, updateDocs } from '../scripts/docs.mjs';
import { validateDefinition } from '../src/index.ts';

const cli = join(packageRoot, 'scripts/cli.mjs');
const fixture = join(packageRoot, 'templates/video-deconstruct');
const run = (args, entry = cli) => spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8' });
const read = path => JSON.parse(readFileSync(path, 'utf8'));
function temp(t) {
  const path = mkdtempSync(join(tmpdir(), 'omnimux-form-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}
function jsonOutput(result) {
  assert.equal(result.error, undefined);
  return JSON.parse(result.stdout);
}

test('help lists the actual commands; missing/unknown options fail with nonzero exit', () => {
  assert.equal(run(['--help']).status, 0);
  for (const args of [[], ['unknown'], ['check'], ['preview', 'x'], ['docs', '--unknown'], ['check', '--unknown'], ['init', '--template', 'video-deconstruct'], ['init', '--template', 'video-deconstruct', '--template', 'other']]) {
    const result = run(args);
    assert.equal(result.status, 1, args.join(' '));
    assert.equal(jsonOutput(result).ok, false);
  }
});

test('check and preview are read-only and expose actual validation failures', t => {
  const directory = temp(t);
  cpSync(fixture, directory, { recursive: true });
  const snapshot = () => Object.fromEntries(readdirSync(directory).map(name => [name, readFileSync(join(directory, name), 'utf8')]));
  const before = snapshot();
  const def = join(directory, 'definition.json'), values = join(directory, 'values.json');
  for (const args of [['check', def], ['check', def, values], ['preview', def, values]]) {
    const result = run(args);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(jsonOutput(result).ok, true);
  }
  assert.deepEqual(jsonOutput(run(['preview', def, values])).value, read(join(directory, 'expected-draft.json')));
  assert.deepEqual(snapshot(), before);
  writeFileSync(values, JSON.stringify(read(join(directory, 'invalid-values.json')).values));
  for (const command of ['check', 'preview']) {
    const result = run([command, def, values]);
    assert.equal(result.status, 1);
    assert.equal(jsonOutput(result).errors[0].code, 'REQUIRED');
  }
  writeFileSync(values, '{broken json');
  assert.equal(run(['preview', def, values]).status, 1);
  assert.equal(run(['check', join(directory, 'missing.json')]).status, 1);
});

test('init copies a valid starting form and never overwrites an existing directory, file or symlink', t => {
  const directory = temp(t);
  const target = join(directory, 'new-form');
  const args = ['init', '--template', 'video-deconstruct', '--id', 'new-form', '--out', target];
  const result = run(args);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(read(join(target, 'definition.json')).id, 'new-form');
  assert.equal(run(['check', join(target, 'definition.json'), join(target, 'values.json')]).status, 0);
  assert.deepEqual(jsonOutput(run(['preview', join(target, 'definition.json'), join(target, 'values.json')])).value, read(join(target, 'expected-draft.json')));
  writeFileSync(join(target, 'definition.json'), 'user content');
  assert.equal(run(args).status, 1);
  assert.equal(readFileSync(join(target, 'definition.json'), 'utf8'), 'user content');
  const file = join(directory, 'existing-file');
  writeFileSync(file, 'keep');
  assert.equal(run([...args.slice(0, -1), file]).status, 1);
  assert.equal(readFileSync(file, 'utf8'), 'keep');
  const link = join(directory, 'existing-link');
  symlinkSync(target, link, 'dir');
  assert.equal(run([...args.slice(0, -1), link]).status, 1);
  assert.equal(readFileSync(join(target, 'definition.json'), 'utf8'), 'user content');
});

test('init rejects invalid identifiers and template traversal before creating output', t => {
  const directory = temp(t), target = join(directory, 'not-created');
  for (const args of [
    ['init', '--template', '../video-deconstruct', '--id', 'valid', '--out', target],
    ['init', '--template', 'video-deconstruct', '--id', 'Bad ID', '--out', target],
  ]) assert.equal(run(args).status, 1);
  assert.equal(existsSync(target), false);
});

test('generated reference example is valid and matches the official source', () => {
  const document = generatedFiles().get('generated/reference.md');
  const examples = [...document.matchAll(/```json\n([\s\S]*?)\n```/g)];
  assert.equal(examples.length, 1);
  for (const example of examples) {
    const definition = JSON.parse(example[1]);
    assert.equal(validateDefinition(definition).ok, true);
    assert.deepEqual(definition, read(join(fixture, 'definition.json')));
  }
});

test('docs check fails on missing or changed generated artifacts without rewriting them', t => {
  const root = join(temp(t), 'with spaces # and unicode 中文');
  mkdirSync(join(root, 'generated'), { recursive: true });
  updateDocs({ root });
  assert.deepEqual(updateDocs({ root, check: true }), []);
  for (const relative of generatedFiles().keys()) {
    const path = join(root, relative), original = readFileSync(path, 'utf8');
    writeFileSync(path, `${original}\ndrift`);
    assert.deepEqual(updateDocs({ root, check: true }), [relative]);
    assert.equal(readFileSync(path, 'utf8'), `${original}\ndrift`);
    writeFileSync(path, original);
  }
  rmSync(join(root, 'generated/form.schema.json'));
  assert.deepEqual(updateDocs({ root, check: true }), ['generated/form.schema.json']);
});

test('CLI returns nonzero for real docs drift in an isolated package fixture', t => {
  const root = temp(t);
  for (const name of ['src', 'scripts', 'generated', 'templates']) cpSync(join(packageRoot, name), join(root, name), { recursive: true });
  const modules = join(root, 'node_modules');
  mkdirSync(modules);
  const zodRoot = fileURLToPath(new URL('.', import.meta.resolve('zod/package.json')));
  symlinkSync(zodRoot, join(modules, 'zod'), 'dir');
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  const entry = join(root, 'scripts/cli.mjs');
  const clean = run(['docs', '--check'], entry);
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  writeFileSync(join(root, 'generated/reference.md'), 'stale reference');
  const result = run(['docs', '--check'], entry);
  assert.equal(result.status, 1);
  assert.equal(jsonOutput(result).errors[0].code, 'DOCS_DRIFT');
  assert.equal(readFileSync(join(root, 'generated/reference.md'), 'utf8'), 'stale reference');
});

test('Skill reference links resolve and generated command help is in sync', () => {
  const skillRoot = resolve(packageRoot, '../../.agents/skills/omnimux-form-authoring');
  for (const relative of ['SKILL.md', 'references/workflow.md']) {
    const path = join(skillRoot, relative), body = readFileSync(path, 'utf8');
    for (const [, target] of body.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^https?:/.test(target)) continue;
      assert.equal(existsSync(resolve(path, '..', target.split('#')[0])), true, target);
    }
  }
  const reference = generatedFiles().get('generated/reference.md');
  const output = run(['--help']).stdout;
  for (const line of output.split('\n').filter(line => line.startsWith('pnpm --config.verify-deps-before-run=false form:'))) assert.ok(reference.includes(line));
});
