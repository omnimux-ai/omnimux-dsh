#!/usr/bin/env node
/**
 * scripts/upstream-sentinel.mjs
 *
 * 上游哨兵：比对上游模型清单与本地登记，差异即报警——
 * 把「上游改名/下线/渠道异常」从用户先发现变成哨兵先发现。
 *
 * 只读与校验探针：不发真实生成请求、不改登记文件，只输出报告。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REPORT_DIR = join(sourceRoot, '.agent-reports', 'upstream-sentinel');
const DISPOSITIONS = join(sourceRoot, 'plugins/omnimux/src/catalog/contract/dispositions.json');
const MANIFEST = join(sourceRoot, 'plugins/omnimux/src/catalog/contract/auto-serving-manifest.json');
const VENDORS_DIR = join(sourceRoot, 'plugins/omnimux/src/media/vendors');

const ID_RE = /^[a-z][a-z0-9.-]{2,63}$/;
const PROBE_MODEL = '__sentinel_invalid_model__';

export function dispositionIds(doc) {
  const list = doc?.dispositions ?? [];
  return new Set(list.map((x) => x?.id ?? x?.model).filter((x) => typeof x === 'string' && ID_RE.test(x)));
}

export function manifestIds(doc) {
  const list = doc?.models ?? [];
  return new Set(list.map((x) => x?.id ?? x?.productId).filter((x) => typeof x === 'string' && ID_RE.test(x)));
}

export function vendorIds(source) {
  const out = new Set();
  for (const m of String(source).matchAll(/["'`]([a-z][a-z0-9]*(?:-[a-z0-9.]+)+)["'`]/g)) {
    if (ID_RE.test(m[1])) out.add(m[1]);
  }
  return out;
}

export function parseUpstreamModels(payload) {
  const list = payload?.data?.data ?? payload?.data ?? payload;
  return new Set((Array.isArray(list) ? list : []).filter((x) => typeof x === 'string' && ID_RE.test(x)));
}

export function diffRegistrations({ upstream, dispositions, manifest }) {
  const local = new Set([...dispositions, ...manifest]);
  const localOnly = [...local].filter((id) => !upstream.has(id)).sort();
  const upstreamOnly = [...upstream].filter((id) => !local.has(id)).sort();
  return { localOnly, upstreamOnly };
}

export async function probeEndpoint(url, { fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const outcome = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: PROBE_MODEL }),
    signal: controller.signal,
  }).then(
    (res) => ({ url, status: res.status, ok: res.status >= 400 && res.status < 500 }),
    (error) => ({ url, status: null, ok: false, error: error?.name === 'AbortError' ? 'timeout' : (error?.message ?? String(error)) }),
  );
  clearTimeout(timer);
  return outcome;
}

export function createUpstreamSentinel(deps = {}) {
  const io = deps.io ?? { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync };
  const execImpl = deps.execImpl ?? execFileSync;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const readImpl = deps.readImpl ?? io.readFileSync ?? readFileSync;
  const now = deps.now ?? (() => new Date());
  const uuid = deps.uuid ?? (() => Math.random().toString(36).slice(2, 10));

  const loadJson = (p) => JSON.parse(readImpl(p, 'utf8'));
  const vendorSource = () => {
    const names = io.readdirSync(VENDORS_DIR).filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));
    return names.map((f) => readImpl(join(VENDORS_DIR, f), 'utf8')).join('\n');
  };

  return async function runSentinel({ offline = false, reportDir = DEFAULT_REPORT_DIR, endpoints = [] } = {}) {
    const report = {
      runId: uuid(), startedAt: now().toISOString(), completedAt: null,
      offline, upstreamCount: 0, localCount: 0,
      localOnly: [], upstreamOnly: [], probes: [],
      status: 'fail', issues: [],
    };

    const upstream = deps.upstreamModels
      ?? parseUpstreamModels(JSON.parse(execImpl('omnimux', ['models', '--json'], { encoding: 'utf8', timeout: 30000 })));
    report.upstreamCount = upstream.size;

    const dispositions = dispositionIds(loadJson(DISPOSITIONS));
    const manifest = manifestIds(loadJson(MANIFEST));
    const vendors = io.existsSync(VENDORS_DIR)
      ? vendorIds(vendorSource())
      : new Set();
    // 上游 diff 只比结构化登记；vendor 字面量只做交叉核对，不进 local-only（源码里有大量非模型字符串）。
    const { localOnly, upstreamOnly } = diffRegistrations({ upstream, dispositions, manifest });
    report.localCount = dispositions.size + manifest.size;
    report.vendorMismatched = [...vendors].filter((id) => !dispositions.has(id) && !manifest.has(id)).sort();
    report.localOnly = localOnly;
    report.upstreamOnly = upstreamOnly;
    if (localOnly.length) report.issues.push(`本地登记但上游已下线/改名：${localOnly.join(', ')}`);
    if (upstreamOnly.length) report.issues.push(`上游新增未登记（评估接入）：${upstreamOnly.slice(0, 20).join(', ')}${upstreamOnly.length > 20 ? ` 等 ${upstreamOnly.length} 个` : ''}`);
    if (report.vendorMismatched.length) report.issues.push(`厂商源码中出现但两份清单都未登记的 ID（人工核对）：${report.vendorMismatched.slice(0, 20).join(', ')}`);

    if (!offline) {
      for (const url of endpoints.length ? endpoints : ['https://api.omnimux.ai/v1/images/generations']) {
        report.probes.push(await probeEndpoint(url, { fetchImpl }));
      }
      const dead = report.probes.filter((p) => !p.ok);
      if (dead.length) report.issues.push(`探针不可达：${dead.map((d) => `${d.url} ${d.status ?? d.error}`).join('; ')}`);
    }

    report.status = (localOnly.length || report.probes.some((p) => !p.ok)) ? 'warn' : 'pass';
    report.completedAt = now().toISOString();
    io.mkdirSync(reportDir, { recursive: true });
    const day = report.startedAt.slice(0, 10);
    const mdPath = join(reportDir, `${day}.md`);
    const jsonPath = join(reportDir, `${day}.json`);
    io.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
    const lines = [
      `# 上游哨兵 ${day}`,
      '',
      `- 上游模型数：${report.upstreamCount}；本地登记数：${report.localCount}`,
      `- local-only（本地有上游无，疑似下线/改名）：${report.localOnly.length ? report.localOnly.join(', ') : '无'}`,
      `- upstream-only（上游新增未登记）：${report.upstreamOnly.length ? report.upstreamOnly.join(', ') : '无'}`,
      report.probes.length ? `- 探针：${report.probes.map((p) => `${p.url} ${p.status ?? p.error}`).join('；')}` : '- 探针：offline 未执行',
      `- 结论：${report.status}`,
    ];
    io.writeFileSync(mdPath, lines.join('\n') + '\n');
    report.reportPaths = { md: mdPath, json: jsonPath };
    return report;
  };
}

export const runUpstreamSentinel = createUpstreamSentinel();

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const offline = argv.includes('--offline');
  const reportDir = argv.find((a) => a.startsWith('--report-dir='))?.split('=')[1] ?? DEFAULT_REPORT_DIR;
  const report = await runUpstreamSentinel({ offline, reportDir });
  const tag = { pass: '✅', warn: '⚠️', error: '❌', fail: '❌' }[report.status] ?? '❌';
  console.log(`${tag} upstream-sentinel status=${report.status}（上游 ${report.upstreamCount} / 本地 ${report.localCount}）`);
  if (report.localOnly.length) console.warn(`   local-only：${report.localOnly.join(', ')}`);
  if (report.upstreamOnly.length) console.warn(`   upstream-only（评估接入）：${report.upstreamOnly.slice(0, 10).join(', ')}${report.upstreamOnly.length > 10 ? '…' : ''}`);
  for (const p of report.probes) console.log(`   探针 ${p.url}: ${p.status ?? p.error}`);
  console.log(`   报告: ${report.reportPaths?.md}`);
  if (report.issues.length) for (const i of report.issues) console.warn(`   ${i}`);
  process.exitCode = report.status === 'pass' ? 0 : 1;
}
