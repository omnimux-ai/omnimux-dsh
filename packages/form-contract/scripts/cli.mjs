import { readFileSync, writeFileSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDefinition, validateValues, buildDraft } from '../src/index.ts';
import { packageRoot, updateDocs } from './docs.mjs';
import { usage } from './commands.mjs';

export function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
const print = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
const failure = (code, message, path = []) => ({ ok: false, errors: [{ code, path, message }] });

export function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (command === '--help' || command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (command === 'check' || command === 'preview') {
    if (args.length < 1 || args.length > 2 || (command === 'preview' && args.length !== 2) || args.some(arg => arg.startsWith('--'))) throw new Error(usage());
    const definition = readJson(resolve(args[0]));
    const result = command === 'preview' ? buildDraft(definition, readJson(resolve(args[1])))
      : args.length === 2 ? validateValues(definition, readJson(resolve(args[1]))) : validateDefinition(definition);
    print(result);
    return result.ok ? 0 : 1;
  }
  if (command === 'docs') {
    if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) throw new Error(usage());
    const stale = updateDocs({ check: args[0] === '--check' });
    print(stale.length ? failure('DOCS_DRIFT', '生成参考缺失或过期；运行 pnpm form: docs', stale) : { ok: true });
    return stale.length ? 1 : 0;
  }
  if (command === 'init') {
    const options = new Map();
    for (let index = 0; index < args.length; index += 2) {
      if (!['--template', '--out', '--id'].includes(args[index]) || !args[index + 1] || args[index + 1].startsWith('--') || options.has(args[index])) throw new Error(usage());
      options.set(args[index], args[index + 1]);
    }
    if (options.size !== 3) throw new Error(usage());
    const template = options.get('--template');
    const templatesRoot = join(packageRoot, 'templates');
    if (!readdirSync(templatesRoot, { withFileTypes: true }).some(entry => entry.isDirectory() && entry.name === template)) throw new Error('未知官方模板');
    const definition = readJson(join(templatesRoot, template, 'definition.json'));
    definition.id = options.get('--id');
    const values = readJson(join(templatesRoot, template, 'values.json'));
    const draft = buildDraft(definition, values);
    if (!draft.ok) { print(draft); return 1; }
    const target = resolve(options.get('--out'));
    // Exclusive directory creation rejects existing directories and symlinks before any writes.
    mkdirSync(target);
    for (const [name, value] of [['definition.json', definition], ['values.json', values], ['expected-draft.json', draft.value]]) {
      writeFileSync(join(target, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    }
    print({ ok: true, target, template: basename(template), note: '样例素材为离线引用；请替换业务内容并重新检查。' });
    return 0;
  }
  throw new Error(usage());
}

function isEntrypoint() {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { return false; }
}

if (isEntrypoint()) {
  try { process.exitCode = main(); }
  catch (error) {
    print(failure('CLI_ERROR', error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
