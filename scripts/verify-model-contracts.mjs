#!/usr/bin/env node
/**
 * Model capability contract verifier (H1).
 *
 * Modes:
 *   --audit  (default) admission-strict; coverage gaps reported, exit 0 if admission ok
 *   --strict           also fail on coverage_missing
 *   --json             machine-readable report on stdout
 *
 * Fail-closed usage:
 *   unknown flag / missing --specs-dir value / --audit + --strict → exit 2
 *   JSON mode: usage errors still emit pure JSON on stdout
 *
 * Malformed YAML / schema / registry / profile errors always exit 1.
 * Does not mutate runtime buildModelCatalog.
 * Does not call process.exit when imported (tests use parseArgs/runVerify).
 */
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyAutoServing } from './verify-auto-serving.mjs';
import { verifyCrossPluginModelAlignment } from './verify-cross-plugin-model-alignment.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contractEntry = join(root, 'plugins/omnimux/src/catalog/contract/index.js');
const thisFile = resolvePath(fileURLToPath(import.meta.url));

export const EXIT_OK = 0;
export const EXIT_FAIL = 1;
export const EXIT_USAGE = 2;

/**
 * Scan model parameters to forbid hardcoded physical pixel dimensions (No-Concrete-Pixels Lint).
 * @param {object} index
 * @returns {object[]}
 */
export function verifyNoConcretePixels(index) {
  const issues = [];
  const pixelRegex = /^\d{3,5}x\d{3,5}$/i;
  const models = index?.all ? index.all() : (index?.byId ? Array.from(index.byId.values()) : []);
  for (const model of models) {
    if (!model.parameters || typeof model.parameters !== 'object') continue;
    for (const [paramKey, paramDef] of Object.entries(model.parameters)) {
      if (!paramDef || typeof paramDef !== 'object') continue;
      if (Array.isArray(paramDef.options)) {
        paramDef.options.forEach((opt, idx) => {
          const val = opt && typeof opt === 'object' && 'value' in opt ? opt.value : opt;
          if (typeof val === 'string' && pixelRegex.test(val.trim())) {
            issues.push({
              level: 'error',
              code: 'parameter_concrete_pixels_forbidden',
              modelId: model.id,
              path: `parameters.${paramKey}.options[${idx}].value`,
              file: model.sourceFile,
              message: `Physical pixel dimension "${val}" is forbidden in parameters.${paramKey}.options.value; use semantic tiers (e.g. 1K, 2K, 4K) instead`,
            });
          }
        });
      }
      if (typeof paramDef.defaultValue === 'string' && pixelRegex.test(paramDef.defaultValue.trim())) {
        issues.push({
          level: 'error',
          code: 'parameter_concrete_pixels_forbidden',
          modelId: model.id,
          path: `parameters.${paramKey}.defaultValue`,
          file: model.sourceFile,
          message: `Physical pixel dimension "${paramDef.defaultValue}" is forbidden in parameters.${paramKey}.defaultValue; use semantic tiers (e.g. 1K, 2K, 4K) instead`,
        });
      }
    }
  }
  return issues;
}

/**
 * Verify parameter dispatch closure for all live models against profile logicalFields (Parameter-Dispatch-Closure Lint).
 * @param {object} index
 * @param {object} profilesObj
 * @returns {object[]}
 */
export function verifyParameterDispatchClosure(index, profilesObj) {
  const issues = [];
  const profilesMap = new Map();
  const profilesList = Array.isArray(profilesObj?.profiles)
    ? profilesObj.profiles
    : Array.isArray(profilesObj)
      ? profilesObj
      : [];
  for (const p of profilesList) {
    if (p?.id) profilesMap.set(p.id, p);
  }

  const models = index?.all ? index.all() : (index?.byId ? Array.from(index.byId.values()) : []);
  for (const model of models) {
    const isModelLive = model.execution?.status === 'live';
    const liveOp = (model.operations ?? []).find((op) => op.execution?.status === 'live');
    if (!isModelLive && !liveOp) continue;

    const profileId = model.execution?.profileId || liveOp?.execution?.profileId;
    if (!profileId) continue;

    const profile = profilesMap.get(profileId);
    if (!profile) continue;

    const logicalFields = new Set(profile.logicalFields ?? []);
    if (!model.parameters || typeof model.parameters !== 'object') continue;

    for (const paramKey of Object.keys(model.parameters)) {
      if (!logicalFields.has(paramKey)) {
        issues.push({
          level: 'error',
          code: 'parameter_dispatch_closure_missing',
          modelId: model.id,
          path: `parameters.${paramKey}`,
          file: model.sourceFile,
          message: `Parameter "${paramKey}" declared by live model "${model.id}" is not registered in profile "${profileId}" logicalFields`,
        });
      }
    }
  }
  return issues;
}

/**
 * @param {string[]} argv
 * @returns {{
 *   help?: boolean,
 *   mode: 'audit'|'strict',
 *   json: boolean,
 *   specsDir?: string,
 *   strict: boolean,
 *   usageError?: string,
 *   exitCode?: number,
 * }}
 */
export function parseArgs(argv = process.argv.slice(2)) {
  let mode = /** @type {'audit'|'strict'|null} */ (null);
  let json = false;
  /** @type {string|undefined} */
  let specsDir;
  /** @type {string|undefined} */
  let usageError;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--strict') {
      if (mode === 'audit') {
        usageError = 'conflicting flags: --audit and --strict are mutually exclusive';
        break;
      }
      mode = 'strict';
    } else if (a === '--audit') {
      if (mode === 'strict') {
        usageError = 'conflicting flags: --audit and --strict are mutually exclusive';
        break;
      }
      mode = 'audit';
    } else if (a === '--json') {
      json = true;
    } else if (a === '--specs-dir') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) {
        usageError = '--specs-dir requires a path value';
        break;
      }
      specsDir = next;
      i++;
    } else if (a === '--help' || a === '-h') {
      return { help: true, mode: mode ?? 'audit', json, specsDir, strict: (mode ?? 'audit') === 'strict' };
    } else if (a.startsWith('-')) {
      usageError = `unknown flag: ${a}`;
      break;
    } else {
      usageError = `unexpected argument: ${a}`;
      break;
    }
  }

  if (usageError) {
    return {
      help: false,
      mode: mode ?? 'audit',
      json,
      specsDir,
      strict: (mode ?? 'audit') === 'strict',
      usageError,
      exitCode: EXIT_USAGE,
    };
  }

  const resolved = mode ?? 'audit';
  return {
    help: false,
    mode: resolved,
    json,
    specsDir,
    strict: resolved === 'strict',
  };
}

function printHelp(stream = process.stdout) {
  stream.write(`Usage: node scripts/verify-model-contracts.mjs [--audit|--strict] [--json] [--specs-dir <path>]

  --audit       Admission-strict + coverage audit (default; H1 CI)
  --strict      Also fail when runtime ids lack YAML (H2+)
  --json        Print full report JSON (usage errors also JSON)
  --specs-dir   Override specs directory (value required)
  --help, -h    Show help

  Exit codes:
    0  ok
    1  admission/coverage failure
    2  usage error (unknown flag, missing value, audit+strict)
`);
}

/**
 * @param {string} message
 * @param {boolean} json
 * @returns {{ exitCode: number, usageError: string, ok: false }}
 */
function usageFailure(message, json) {
  const payload = {
    ok: false,
    exitCode: EXIT_USAGE,
    code: 'cli_usage_error',
    usageError: message,
    message,
  };
  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stderr.write(`error: ${message}\n`);
    printHelp(process.stderr);
  }
  return { ...payload, help: false };
}

/**
 * @param {{
 *   mode?: string,
 *   strict?: boolean,
 *   json?: boolean,
 *   specsDir?: string,
 *   help?: boolean,
 *   usageError?: string,
 *   exitCode?: number,
 * }} opts
 * @param {{ verifyContracts?: Function, verifyAutoServing?: Function }} [deps]
 */
export async function runVerify(opts = {}, deps = {}) {
  if (opts.usageError || opts.exitCode === EXIT_USAGE) {
    return usageFailure(opts.usageError ?? 'invalid arguments', Boolean(opts.json));
  }

  if (opts.help) {
    printHelp();
    return { exitCode: EXIT_OK, help: true, ok: true };
  }

  const mod = deps.verifyContracts
    ? { verifyContracts: deps.verifyContracts }
    : await import(pathToFileURL(contractEntry).href);

  const contractReport = mod.verifyContracts({
    specsDir: opts.specsDir,
    strict: Boolean(opts.strict) || opts.mode === 'strict',
  });
  const autoServing = (deps.verifyAutoServing ?? verifyAutoServing)({ specsDir: opts.specsDir });
  const crossPlugin = (deps.verifyCrossPluginModelAlignment ?? verifyCrossPluginModelAlignment)({
    specsDir: opts.specsDir,
    strict: Boolean(opts.strict) || opts.mode === 'strict',
  });

  let extraGateIssues = [];
  try {
    const index = mod.getContractIndex ? mod.getContractIndex(opts.specsDir) : null;
    const profiles = mod.loadAdapterProfiles ? mod.loadAdapterProfiles() : null;
    if (index) {
      extraGateIssues.push(...verifyNoConcretePixels(index));
      if (profiles) {
        extraGateIssues.push(...verifyParameterDispatchClosure(index, profiles));
      }
    }
  } catch (_e) {
    // contractReport already catches core errors
  }

  const hasGateError = extraGateIssues.some((i) => i.level === 'error');
  const mergedIssues = [
    ...(contractReport.issues ?? []),
    ...autoServing.issues,
    ...crossPlugin.issues,
    ...extraGateIssues,
  ];
  const seenKeys = new Set();
  const dedupedIssues = [];
  for (const iss of mergedIssues) {
    const k = `${iss.code}|${iss.modelId ?? ''}|${iss.path ?? ''}|${iss.message}`;
    if (!seenKeys.has(k)) {
      seenKeys.add(k);
      dedupedIssues.push(iss);
    }
  }

  const isOverallOk = contractReport.ok && autoServing.ok && crossPlugin.ok && !hasGateError;
  const resolvedExitCode = !isOverallOk ? EXIT_FAIL : (contractReport.exitCode ?? EXIT_OK);

  const report = {
    ...contractReport,
    ok: isOverallOk,
    exitCode: resolvedExitCode,
    autoServing,
    crossPlugin,
    issues: dedupedIssues,
  };

  const listedOperations = report.listedOperations ?? report.coverage?.listedOperations ?? [];
  const listedIds = report.listedIds ?? report.coverage?.listedIds ?? [];

  const schemaVersion = report.schemaVersion ?? '1.1';

  if (opts.json) {
    // Strip non-JSON-safe / oversized diagnostic noise for stable machine output.
    // Canonical schemaVersion only — never emit model-capability root `version`.
    const jsonReport = {
      ok: report.ok,
      mode: report.mode,
      schemaVersion,
      contentFingerprint: report.contentFingerprint,
      exitCode: report.exitCode,
      autoServing,
      crossPlugin,
      admission: {
        ok: report.admission?.ok,
        errorCount: report.admission?.errorCount ?? 0,
        warningCount: report.admission?.warningCount ?? 0,
        issues: (report.admission?.issues ?? []).filter((i) => i.level === 'error' || i.level === 'warning'),
      },
      coverage: {
        runtimeCount: report.coverage?.runtimeCount,
        contractCount: report.coverage?.contractCount,
        missingCount: report.coverage?.missingCount,
        extraCount: report.coverage?.extraCount,
        missingInYaml: report.coverage?.missingInYaml ?? [],
        extraInYaml: report.coverage?.extraInYaml ?? [],
        listedOperations: listedOperations,
        listedOperationCount: listedOperations.length,
        listedIds,
        listedModelIds: report.listedModelIds ?? report.coverage?.listedModelIds ?? listedIds,
      },
      dispositions: {
        total: report.dispositions?.total ?? 0,
        byDisposition: report.dispositions?.byDisposition ?? {},
        forbiddenListed: report.dispositions?.forbiddenListed ?? [],
        unresolvedDispositions: report.dispositions?.unresolvedDispositions ?? [],
      },
      defaultsByOperation: report.defaultsByOperation ?? {},
      listedOperations,
      listedIds,
      listedModelIds: report.listedModelIds ?? report.coverage?.listedModelIds ?? listedIds,
      issues: (report.issues ?? []).filter(
        (i) =>
          i.level === 'error' ||
          (i.level === 'warning' &&
            /^(coverage_|disposition_|defaults_|cordis_|evidence_)/.test(i.code ?? '')),
      ),
    };
    process.stdout.write(`${JSON.stringify(jsonReport, null, 2)}\n`);
  } else {
    const cov = report.coverage ?? {};
    const adm = report.admission ?? {};
    const disp = report.dispositions ?? {};
    if (crossPlugin.notice) {
      process.stdout.write(`${crossPlugin.notice}\n`);
    }
    process.stdout.write(
      [
        `model-contracts mode=${report.mode} ok=${report.ok}`,
        `auto-serving offline ok=${autoServing.ok} registered=${autoServing.registeredCount} required=${autoServing.requiredCount}`,
        `cross-plugin offline ok=${crossPlugin.ok} whitelistChecked=${crossPlugin.alignment?.whitelistModelsChecked ?? 0}`,
        `schemaVersion=${schemaVersion}`,
        `fingerprint=${report.contentFingerprint}`,
        `admission errors=${adm.errorCount ?? 0} warnings=${adm.warningCount ?? 0}`,
        `coverage runtime=${cov.runtimeCount ?? 0} contract=${cov.contractCount ?? 0} missing=${cov.missingCount ?? 0} extra=${cov.extraCount ?? 0}`,
        `dispositions total=${disp.total ?? 0} unresolved=${(disp.unresolvedDispositions ?? []).length} forbiddenListed=${(disp.forbiddenListed ?? []).length}`,
        `listedOperations=${listedOperations.length}`,
        `listedIds=${listedIds.length} (any-op model summary only; prefer listedOperations)`,
      ].join('\n') + '\n',
    );
    const errors = (report.issues ?? []).filter((i) => i.level === 'error');
    for (const iss of errors.slice(0, 40)) {
      process.stderr.write(
        `[error] ${iss.code}${iss.modelId ? ` model=${iss.modelId}` : ''}${iss.operationId ? ` op=${iss.operationId}` : ''}${iss.file ? ` file=${iss.file}` : ''}${iss.path ? ` path=${iss.path}` : ''}: ${iss.message}\n`,
      );
    }
    if (errors.length > 40) {
      process.stderr.write(`... and ${errors.length - 40} more errors\n`);
    }
    if (!opts.strict && (cov.missingCount ?? 0) > 0) {
      process.stdout.write(
        `coverage gaps (audit only): ${(cov.missingInYaml ?? []).slice(0, 12).join(', ')}${(cov.missingCount ?? 0) > 12 ? '…' : ''}\n`,
      );
    }
  }

  return {
    ...report,
    listedOperations,
    listedIds,
    exitCode: report.exitCode ?? (report.ok ? EXIT_OK : EXIT_FAIL),
  };
}

/**
 * True when this file is the process entry (Node ≥20.11 `import.meta.main`,
 * with argv path fallback for older runtimes). Never true when imported by tests.
 * @returns {boolean}
 */
function isCliEntry() {
  if (import.meta.main === true) return true;
  if (import.meta.main === false) return false;
  if (!process.argv[1]) return false;
  try {
    const argvResolved = resolvePath(process.argv[1]);
    if (argvResolved === thisFile) return true;
    if (import.meta.url === pathToFileURL(argvResolved).href) return true;
  } catch {
    return false;
  }
  return false;
}

if (isCliEntry()) {
  const opts = parseArgs();
  const report = await runVerify(opts);
  // Only the CLI entry uses process.exit; imported tests call runVerify/parseArgs.
  process.exit(report.exitCode ?? EXIT_OK);
}
