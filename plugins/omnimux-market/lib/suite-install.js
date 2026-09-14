/**
 * @file plugins/omnimux-market/src/suite-install.ts
 * 技能市场「套件」一键安装：一次把三样东西装到位。
 *
 *   1. 技能：包内 `skills/<name>/` 摊平到 `$DSH_HOME/skills/<name>/`（既有摊平语义）；
 *      平铺仓库（技能直接躺在包根下、没有 `skills/` 中间层）由清单项的可选 `path` 定位；
 *   2. 规则：包内 `contracts/*.md` 转成文本段，幂等写进目标 `AGENTS.md` 的套件托管段；
 *   3. Agent：包内 `agents/*.md` 的正文写成 `$DSH_HOME/.agent-presets/<套件>-<agent>/`。
 *
 * 写入边界：只写 `$DSH_HOME` 之下，以及显式选定的项目根 `AGENTS.md`（其余一个字节不动）。
 * 三件事彼此独立：任一环节失败都记进 `failed`，已成功项不回滚，回执里标注未完成项。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { invalidateCatalogMemos } from './expert/catalog.js';
import { installItem, installNestedSkills, installSkillAt } from './expert/install.js';
import { skillDir } from './expert/paths.js';
import { writeAgentPreset } from './expert-presets.js';
import { uninstallSkill } from './install.js';
/* ---------------------------------------------------------------- 托管段标记 */
/**
 * 套件规则托管段标记。刻意不复用连接器的 MCP 段常量：两者写进完全不同的文件，
 * 标记混用会让「清空另一方的托管段」变成可能。
 */
export function suiteRuleBegin(id) {
    return `<!-- omnimux-suite:${id} begin -->`;
}
export function suiteRuleEnd(id) {
    return `<!-- omnimux-suite:${id} end -->`;
}
/**
 * 幂等写入套件托管段：段已存在且逐字节相同则原样返回，内容变化时整段替换，
 * 不存在时在文件末尾追加一个段。段外内容一个字节都不动。
 *
 * 追加时固定插入一个 `\n` 分隔换行（无论文件是否以换行结尾），`dropSuiteRules`
 * 据此能逐字节还原——文件原本以几个换行结尾都不影响。
 */
export function spliceSuiteRules(text, id, body) {
    const begin = suiteRuleBegin(id);
    const end = suiteRuleEnd(id);
    const block = `${begin}\n${body}\n${end}\n`;
    const start = text.indexOf(begin);
    const stop = text.indexOf(end);
    if (start >= 0 && stop > start) {
        const tail = text.slice(stop + end.length);
        const regionEnd = stop + end.length + (tail.startsWith('\n') ? 1 : 0);
        if (text.slice(start, regionEnd) === block)
            return text;
        return text.slice(0, start) + block + text.slice(regionEnd);
    }
    if (text === '')
        return block;
    return `${text}\n${block}`;
}
/**
 * 摘掉套件托管段。托管段落在文件末尾时，连同装配时插入的分隔换行一起还原，
 * 使「装完再卸」回到安装前的字节；段后还有别的内容时只摘掉本段。
 */
export function dropSuiteRules(text, id) {
    const begin = suiteRuleBegin(id);
    const end = suiteRuleEnd(id);
    const start = text.indexOf(begin);
    const stop = text.indexOf(end);
    if (start < 0 || stop < start)
        return text;
    const before = text.slice(0, start);
    const tail = text.slice(stop + end.length);
    const after = tail.startsWith('\n') ? tail.slice(1) : tail;
    // 装配时固定插入过一个分隔换行（见 spliceSuiteRules），连它一起摘掉才逐字节还原；
    // 段后还有别的内容时同样只影响这个分隔换行。
    const restored = before.endsWith('\n') ? before.slice(0, -1) : before;
    return restored + after;
}
/** 自 `startDir` 逐级上溯找项目根标记，与平台 `dsh-agent-instructions` 同规则。 */
export function findProjectRoot(startDir, markers = ['.git']) {
    const start = resolve(startDir);
    let current = start;
    for (;;) {
        for (const marker of markers) {
            if (existsSync(join(current, marker)))
                return { root: current, matched: true };
        }
        const parent = dirname(current);
        if (parent === current)
            return { root: start, matched: false };
        current = parent;
    }
}
/**
 * 规则文件落点：项目级 = 项目根 `AGENTS.md`；个人全局 = `$DSH_HOME/AGENTS.md`。
 *
 * 项目级必须显式给出会话工作区：服务端不知道当前会话的工作区，拿进程 cwd 顶上
 * 会把规则写进用户没选过的目录。工作区向上无 `.git` 标记时按平台语义把该目录
 * 本身当项目根（平台也是读 `<projectRoot>/AGENTS.md`，不会读别处）。
 */
export function resolveRuleTarget(opts) {
    if (opts.ruleTarget === 'global') {
        return { target: 'global', file: join(opts.home, 'AGENTS.md'), projectRoot: '' };
    }
    const explicit = String(opts.projectDir || opts.cwd || '').trim();
    if (!explicit) {
        throw new Error('未指定工作区目录（projectDir），无法定位项目 AGENTS.md');
    }
    if (!existsSync(explicit) || !statSync(explicit).isDirectory()) {
        throw new Error(`工作区目录不存在: ${explicit}`);
    }
    const { root } = findProjectRoot(explicit);
    return { target: 'project', file: join(root, 'AGENTS.md'), projectRoot: root };
}
/* ------------------------------------------------------------------ 小工具 */
/** 条目名进路径前先过闸：不许 `..`、不许分隔符、不许绝对路径。 */
function isSafeName(name) {
    return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && !name.includes('..');
}
/** 清单项 `path` 进路径前先过闸：必须是包内相对路径，逐段套用 `isSafeName`（故无 `..`、无绝对路径）。 */
function isSafeRelPath(relPath) {
    return relPath.split('/').every((segment) => isSafeName(segment));
}
/**
 * 技能的源目录：清单项带 `path` 时按 `<包根>/<path>/`，缺省沿用 `<包根>/skills/<name>/`。
 * @param {string} packDir
 * @param {string} nestedRoot
 * @param {string} name
 * @param {string} relPath
 */
function skillSourceDir(packDir, nestedRoot, name, relPath) {
    return relPath ? join(packDir, relPath) : join(nestedRoot, name);
}
function stripFrontmatter(text) {
    const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    return match ? text.slice(match[0].length) : text;
}
function frontmatterField(text, key) {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match)
        return '';
    for (const line of match[1].split(/\r?\n/)) {
        const m = line.match(new RegExp(`^${key}\\s*:\\s*(.*)$`));
        if (m)
            return m[1].trim().replace(/^['"]|['"]$/g, '');
    }
    return '';
}
function firstHeading(text) {
    const match = text.match(/^#{1,6}\s+(.+)$/m);
    return match ? match[1].trim() : '';
}
function dirNames(root) {
    if (!existsSync(root) || !statSync(root).isDirectory())
        return [];
    return readdirSync(root).filter((name) => {
        try {
            return statSync(join(root, name)).isDirectory();
        }
        catch {
            return false;
        }
    });
}
function fileNamesWithExt(root, ext) {
    if (!existsSync(root) || !statSync(root).isDirectory())
        return [];
    return readdirSync(root)
        .filter((name) => name.toLowerCase().endsWith(ext))
        .filter((name) => {
        try {
            return statSync(join(root, name)).isFile();
        }
        catch {
            return false;
        }
    });
}
function message(err) {
    return err instanceof Error ? err.message : String(err);
}
function union(primary, extra) {
    const seen = new Set();
    const out = [];
    for (const name of [...primary, ...extra]) {
        if (!name || seen.has(name))
            continue;
        seen.add(name);
        out.push(name);
    }
    return out;
}
function manifest(item) {
    const suite = item.suite || {};
    return {
        skills: Array.isArray(suite.skills) ? suite.skills : [],
        rules: Array.isArray(suite.rules) ? suite.rules : [],
        agents: Array.isArray(suite.agents) ? suite.agents : [],
    };
}
/* -------------------------------------------------------------------- 安装 */
/**
 * 一次安装套件的三样内容。硬失败（找不到套件/包未落盘）抛错；
 * 单环节失败记进 `failed` 并继续做完其余环节。
 */
export function installSuite(opts) {
    const { home, item } = opts;
    if (!item)
        throw new Error('unknown suite');
    if (item.kind !== 'suite')
        throw new Error(`item ${item.id} is not a suite`);
    const slug = String(item.skill || '').trim();
    if (!slug)
        throw new Error(`item ${item.id} missing skill`);
    // 包名会进 $DSH_HOME/skills/<slug>/，先过路径闸再谈落盘
    if (!isSafeName(slug))
        throw new Error(`item ${item.id} 包名非法: ${slug}`);
    const plan = manifest(item);
    // 「技能本次之前是否已存在」必须在包落盘之前采样：installItem 落包时会顺手摊平嵌套技能
    const preNestedRoot = join(skillDir(home, slug), 'skills');
    const preNames = union(plan.skills.map((entry) => entry.name), dirNames(preNestedRoot));
    const skillsBefore = new Set(preNames.filter((name) => isSafeName(name) && existsSync(join(skillDir(home, name), 'SKILL.md'))));
    const result = {
        id: item.id,
        skill: slug,
        title: String(item.title || item.id),
        already: false,
        partial: false,
        failed: [],
        pack: { skill: slug, dir: skillDir(home, slug), already: false },
        skills: { dir: join(home, 'skills'), total: 0, installed: 0, already: 0, failed: 0, items: [] },
        rules: {
            target: opts.ruleTarget === 'global' ? 'global' : 'project',
            file: '',
            projectRoot: '',
            total: 0,
            written: 0,
            already: 0,
            failed: 0,
            items: [],
        },
        agents: {
            dir: join(home, '.agent-presets'),
            total: 0,
            installed: 0,
            already: 0,
            failed: 0,
            items: [],
        },
    };
    // 1. 包落盘：与专家/团队包同一套 bundled / git 语义（整包 + 根 SKILL.md + 摊平嵌套技能）
    try {
        const installed = installItem({
            catalog: opts.catalog,
            id: item.id,
            home,
            profileDir: opts.profileDir,
            packageRoot: opts.packageRoot,
        });
        result.pack.already = Boolean(installed?.already);
    }
    catch (err) {
        result.failed.push({ part: 'pack', name: slug, error: message(err) });
    }
    const packDir = result.pack.dir;
    const packReady = existsSync(packDir);
    if (!packReady) {
        const reason = result.failed.find((f) => f.part === 'pack')?.error || '套件包未落盘';
        throw new Error(`套件 ${item.id} 安装失败：${reason}`);
    }
    installSuiteSkills(home, packDir, plan, result, skillsBefore);
    installSuiteRules(home, packDir, item, plan, result, opts);
    installSuiteAgents(home, packDir, slug, item, plan, result);
    result.partial = result.failed.length > 0;
    result.already = !result.partial
        && result.skills.installed === 0
        && result.rules.written === 0
        && result.agents.installed === 0;
    if (!result.partial) {
        unmarkSuiteUninstalled(home, item.id);
    }
    invalidateCatalogMemos();
    return result;
}
function installSuiteSkills(home, packDir, plan, result, skillsBefore) {
    const nestedRoot = join(packDir, 'skills');
    const names = union(plan.skills.map((entry) => entry.name), dirNames(nestedRoot));
    const relPaths = new Map(plan.skills.filter((entry) => entry.path).map((entry) => [entry.name, String(entry.path)]));
    const flat = [];
    const pending = [];
    for (const name of names) {
        if (!isSafeName(name)) {
            result.failed.push({ part: 'skills', name, error: '技能名非法（含路径字符）' });
            result.skills.items.push({ name, status: 'failed', error: '技能名非法（含路径字符）' });
            continue;
        }
        const path = skillDir(home, name);
        const existed = skillsBefore.has(name);
        const relPath = relPaths.get(name) || '';
        const sourceDir = skillSourceDir(packDir, nestedRoot, name, relPath);
        const sourceLabel = relPath ? `${relPath}/SKILL.md` : `skills/${name}/SKILL.md`;
        if (relPath && !isSafeRelPath(relPath)) {
            const error = `清单项 path 非法（须为包内相对路径）: ${relPath}`;
            result.failed.push({ part: 'skills', name, error });
            result.skills.items.push({ name, status: 'failed', path, error });
            continue;
        }
        const hasSource = existsSync(join(sourceDir, 'SKILL.md'));
        if (existed) {
            result.skills.items.push({ name, status: 'already', path });
            continue;
        }
        if (!hasSource) {
            const error = `包内缺少 ${sourceLabel}`;
            result.failed.push({ part: 'skills', name, error });
            result.skills.items.push({ name, status: 'failed', path, error });
            continue;
        }
        const entry = { name, status: 'installed', path };
        result.skills.items.push(entry);
        pending.push(entry);
        if (relPath)
            flat.push({ entry, relPath });
    }
    // 平铺仓库（技能在包根下、无 skills/ 中间层）逐条装载；一条失败不影响其余
    for (const item of flat) {
        try {
            installSkillAt(home, packDir, item.entry.name, item.relPath);
        }
        catch (err) {
            item.entry.status = 'failed';
            item.entry.error = message(err);
            result.failed.push({ part: 'skills', name: item.entry.name, error: message(err) });
        }
    }
    try {
        installNestedSkills(home, packDir);
    }
    catch (err) {
        for (const entry of pending) {
            if (flat.some((item) => item.entry === entry))
                continue;
            entry.status = 'failed';
            entry.error = message(err);
            result.failed.push({ part: 'skills', name: entry.name, error: message(err) });
        }
    }
    // 摊平是「复制即可」的实现，状态以后回读磁盘为准，不靠返回值推断
    for (const entry of pending) {
        if (entry.status === 'failed')
            continue;
        if (!existsSync(join(String(entry.path), 'SKILL.md'))) {
            entry.status = 'failed';
            entry.error = '技能未落盘';
            result.failed.push({ part: 'skills', name: entry.name, error: '技能未落盘' });
        }
    }
    const counts = tally(result.skills.items);
    result.skills.total = counts.total;
    result.skills.installed = counts.ok;
    result.skills.already = counts.already;
    result.skills.failed = counts.failed;
}
function installSuiteRules(home, packDir, item, plan, result, opts) {
    const rulesRoot = join(packDir, 'contracts');
    const diskNames = fileNamesWithExt(rulesRoot, '.md').map((name) => name.slice(0, -3));
    const names = union(plan.rules.map((entry) => entry.name), diskNames);
    const sections = [];
    const byName = new Map(plan.rules.map((entry) => [entry.name, entry]));
    for (const name of names) {
        if (!isSafeName(name)) {
            result.failed.push({ part: 'rules', name, error: '规则名非法（含路径字符）' });
            result.rules.items.push({ name, status: 'failed', error: '规则名非法（含路径字符）' });
            continue;
        }
        const file = join(rulesRoot, `${name}.md`);
        if (!existsSync(file)) {
            const error = `包内缺少 contracts/${name}.md`;
            result.failed.push({ part: 'rules', name, error });
            result.rules.items.push({ name, status: 'failed', error });
            continue;
        }
        const raw = readFileSync(file, 'utf8');
        const entry = byName.get(name);
        const heading = entry?.title || frontmatterField(raw, 'name') || firstHeading(stripFrontmatter(raw)) || name;
        sections.push(`### ${heading}\n\n${stripFrontmatter(raw).trim()}`);
        result.rules.items.push({ name, status: 'installed' });
    }
    const total = result.rules.items.length;
    if (total === 0)
        return;
    let target;
    try {
        target = resolveRuleTarget({ home, ruleTarget: opts.ruleTarget, projectDir: opts.projectDir, cwd: opts.cwd });
    }
    catch (err) {
        const error = message(err);
        for (const entry of result.rules.items) {
            if (entry.status === 'failed')
                continue;
            entry.status = 'failed';
            entry.error = error;
            result.failed.push({ part: 'rules', name: entry.name, error });
        }
        applyRuleCounts(result);
        return;
    }
    result.rules.target = target.target;
    result.rules.file = target.file;
    result.rules.projectRoot = target.projectRoot;
    const body = [
        `## 套件规则 · ${String(item.title || item.id)}`,
        `<!-- 由 omnimux-market 安装 · 套件 ${item.id} · 规则 ${result.rules.items.length} 条 · 重复安装不会重复追加 -->`,
        ...sections,
    ].join('\n\n');
    try {
        const before = existsSync(target.file) ? readFileSync(target.file, 'utf8') : '';
        const next = spliceSuiteRules(before, item.id, body);
        if (next === before) {
            for (const entry of result.rules.items) {
                if (entry.status !== 'failed')
                    entry.status = 'already';
            }
        }
        else {
            mkdirSync(dirname(target.file), { recursive: true });
            writeFileSync(target.file, next, 'utf8');
            for (const entry of result.rules.items) {
                if (entry.status !== 'failed')
                    entry.status = 'installed';
            }
        }
        for (const entry of result.rules.items)
            if (entry.status === 'installed' || entry.status === 'already')
                entry.path = target.file;
    }
    catch (err) {
        const error = message(err);
        for (const entry of result.rules.items) {
            if (entry.status === 'failed')
                continue;
            entry.status = 'failed';
            entry.error = error;
            result.failed.push({ part: 'rules', name: entry.name, error });
        }
    }
    applyRuleCounts(result);
}
function installSuiteAgents(home, packDir, slug, item, plan, result) {
    const agentsRoot = join(packDir, 'agents');
    const diskNames = fileNamesWithExt(agentsRoot, '.md').map((name) => name.slice(0, -3));
    const names = union(plan.agents.map((entry) => entry.name), diskNames);
    const byName = new Map(plan.agents.map((entry) => [entry.name, entry]));
    for (const [index, name] of names.entries()) {
        if (!isSafeName(name)) {
            result.failed.push({ part: 'agents', name, error: 'Agent 名非法（含路径字符）' });
            result.agents.items.push({ name, status: 'failed', error: 'Agent 名非法（含路径字符）' });
            continue;
        }
        const file = join(agentsRoot, `${name}.md`);
        const presetId = `${slug}-${name}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const dir = join(home, '.agent-presets', presetId);
        const existed = existsSync(join(dir, 'agent.cordis.yml'));
        const entry = byName.get(name);
        if (existed) {
            result.agents.items.push({ name, status: 'already', path: dir });
            continue;
        }
        if (!existsSync(file)) {
            const error = `包内缺少 agents/${name}.md`;
            result.failed.push({ part: 'agents', name, error });
            result.agents.items.push({ name, status: 'failed', path: dir, error });
            continue;
        }
        const raw = readFileSync(file, 'utf8');
        try {
            writeAgentPreset(home, {
                id: presetId,
                name: entry?.title || frontmatterField(raw, 'name') || name,
                description: entry?.desc || frontmatterField(raw, 'description') || '',
                order: 100 + index,
                // persona 取该 agent 文件的正文：frontmatter 是包元数据，不是人格
                persona: stripFrontmatter(raw).trim(),
            });
        }
        catch (err) {
            const error = message(err);
            result.failed.push({ part: 'agents', name, error });
            result.agents.items.push({ name, status: 'failed', path: dir, error });
            continue;
        }
        if (existsSync(join(dir, 'agent.cordis.yml'))) {
            result.agents.items.push({ name, status: 'installed', path: dir });
        }
        else {
            const error = 'Agent preset 未落盘';
            result.failed.push({ part: 'agents', name, error });
            result.agents.items.push({ name, status: 'failed', path: dir, error });
        }
    }
    const counts = tally(result.agents.items);
    result.agents.total = counts.total;
    result.agents.installed = counts.ok;
    result.agents.already = counts.already;
    result.agents.failed = counts.failed;
}
function tally(items) {
    return {
        total: items.length,
        ok: items.filter((it) => it.status === 'installed').length,
        already: items.filter((it) => it.status === 'already').length,
        failed: items.filter((it) => it.status === 'failed').length,
    };
}
function applyRuleCounts(result) {
    const counts = tally(result.rules.items);
    result.rules.total = counts.total;
    result.rules.written = counts.ok;
    result.rules.already = counts.already;
    result.rules.failed = counts.failed;
}
/* -------------------------------------------------------------------- 卸载 */
/**
 * 卸载套件：技能按既有卸载语义删除、AGENTS.md 托管段摘除（段外逐字节还原）、
 * Agent preset 目录删除。三者都幂等，缺什么就报什么，不抛错。
 */
export async function uninstallSuite(opts) {
    const { home, item } = opts;
    if (!item || item.kind !== 'suite')
        throw new Error(`item ${item?.id || ''} is not a suite`);
    const slug = String(item.skill || '').trim();
    const plan = manifest(item);
    const packDir = slug ? skillDir(home, slug) : '';
    const skillsRoot = join(home, 'skills');
    const result = {
        id: item.id,
        skills: { dir: skillsRoot, removed: 0, absent: 0, items: [] },
        rules: { items: [] },
        agents: { dir: join(home, '.agent-presets'), removed: 0, absent: 0, items: [] },
    };
    const nestedRoot = packDir ? join(packDir, 'skills') : '';
    const names = union([slug, ...plan.skills.map((entry) => entry.name)], nestedRoot ? dirNames(nestedRoot) : []).filter((name) => name && isSafeName(name));
    for (const name of names) {
        try {
            const removed = await uninstallSkill(name, skillsRoot);
            result.skills.removed += 1;
            result.skills.items.push({ name, status: 'removed', path: removed.path });
        }
        catch {
            result.skills.absent += 1;
            result.skills.items.push({ name, status: 'absent', path: skillDir(home, name) });
        }
    }
    const targets = opts.ruleTarget ? [opts.ruleTarget] : ['project', 'global'];
    for (const target of targets) {
        let file = '';
        try {
            file = resolveRuleTarget({ home, ruleTarget: target, projectDir: opts.projectDir, cwd: opts.cwd }).file;
        }
        catch (err) {
            result.rules.items.push({ target, name: target, file: '', status: 'skipped', error: message(err) });
            continue;
        }
        if (!existsSync(file)) {
            result.rules.items.push({ target, name: target, file, status: 'absent' });
            continue;
        }
        const before = readFileSync(file, 'utf8');
        const next = dropSuiteRules(before, item.id);
        if (next === before) {
            result.rules.items.push({ target, name: target, file, status: 'absent' });
            continue;
        }
        // 摘掉托管段后什么都不剩：文件本来就是本次安装创建的，直接删掉；
        // 原本就是空文件的情况同样处理，空 AGENTS.md 不承载任何信息。
        if (next === '')
            rmSync(file, { force: true });
        else
            writeFileSync(file, next, 'utf8');
        result.rules.items.push({ target, name: target, file, status: 'removed' });
    }
    const agentsRoot = packDir ? join(packDir, 'agents') : '';
    const agentNames = union(plan.agents.map((entry) => entry.name), agentsRoot ? fileNamesWithExt(agentsRoot, '.md').map((n) => n.slice(0, -3)) : []);
    for (const name of agentNames) {
        if (!isSafeName(name) || !slug)
            continue;
        const presetId = `${slug}-${name}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const dir = join(home, '.agent-presets', presetId);
        if (!existsSync(dir)) {
            result.agents.absent += 1;
            result.agents.items.push({ name: presetId, status: 'absent', path: dir });
            continue;
        }
        try {
            rmSync(dir, { recursive: true, force: true });
            result.agents.removed += 1;
            result.agents.items.push({ name: presetId, status: 'removed', path: dir });
        }
        catch (err) {
            result.agents.absent += 1;
            result.agents.items.push({ name: presetId, status: 'absent', path: dir, error: message(err) });
        }
    }
    if (item.preinstalled === true) {
        markSuiteUninstalled(home, item.id);
    }
    invalidateCatalogMemos();
    return result;
}
export function markSuiteUninstalled(home, id) {
    const dir = join(home, 'omnimux-market');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'uninstalled-suites.json');
    let list = [];
    try {
        if (existsSync(file))
            list = JSON.parse(readFileSync(file, 'utf8'));
    }
    catch { }
    if (!Array.isArray(list))
        list = [];
    if (!list.includes(id)) {
        list.push(id);
        writeFileSync(file, JSON.stringify(list, null, 2) + '\n', 'utf8');
    }
}
export function unmarkSuiteUninstalled(home, id) {
    const file = join(home, 'omnimux-market', 'uninstalled-suites.json');
    if (!existsSync(file))
        return;
    try {
        let list = JSON.parse(readFileSync(file, 'utf8'));
        if (Array.isArray(list) && list.includes(id)) {
            list = list.filter((x) => x !== id);
            writeFileSync(file, JSON.stringify(list, null, 2) + '\n', 'utf8');
        }
    }
    catch { }
}
