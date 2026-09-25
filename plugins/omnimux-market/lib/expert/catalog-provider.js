import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadCatalog } from './catalog.js';
import { packageRoot, resolveHome, skillDir } from './paths.js';
import { installItem } from './install.js';
/**
 * @typedef {Object} InvocationPolicy
 * @property {boolean} modelInvocable
 * @property {boolean} userInvocable
 */
/**
 * @typedef {Object} SkillCandidate
 * @property {string} name
 * @property {string} description
 * @property {string} [whenToUse]
 * @property {InvocationPolicy} invocation
 * @property {string} source
 * @property {number} rank
 * @property {string} provider
 * @property {string} [locator]
 */
/**
 * @typedef {Object} SkillDefinition
 * @property {string} name
 * @property {string} description
 * @property {string} content
 * @property {InvocationPolicy} invocation
 * @property {string} source
 * @property {string} provider
 */
/** 在 ctx.skills 上注册的提供方名称；候选的 provider 字段必须与之完全一致。 */
export const PROVIDER_NAME = 'omnimux-catalog';
/**
 * 目录候选的优先级（数值越低越优先）。取 900 以确保：
 * filesystem 本地根（100/200/300/400/500）与 bundled（600）全部优先于本目录。
 * 于是"已安装"技能由 filesystem 胜出（保持模型可调用），
 * "未安装"技能才由本目录胜出（0 Token，仅 / 菜单可见）。
 */
export const CATALOG_RANK = 900;
/**
 * Read frontmatter description or fallback if present.
 * @param {string} content
 */
function extractDescription(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match)
        return '';
    const descMatch = match[1].match(/^description:\s*([^\r\n]+)/m);
    if (descMatch)
        return descMatch[1].trim();
    return '';
}
/**
 * 构造符合 DSH validateDefinition 契约的定义体。
 * source / provider 为必填字符串，缺失会让加载直接抛错。
 * @param {string} name
 * @param {string} content
 * @param {string} [desc] 正文 frontmatter 未解析出描述时的兜底
 * @returns {SkillDefinition}
 */
function def(name, content, desc) {
    return {
        name,
        description: desc || extractDescription(content) || name,
        content,
        invocation: { modelInvocable: false, userInvocable: true },
        source: 'omnimux-market',
        provider: PROVIDER_NAME,
    };
}
/**
 * Find skill content across local install, bundled catalog, OPC asset library, or trigger JIT install.
 * @param {string} name
 * @param {Object} roots
 * @param {string} roots.home
 * @param {string} roots.packageRoot
 * @param {import('./catalog.js').CatalogDoc} [roots.catalog]
 */
export function resolveSkillDefinition(name, roots) {
    const home = roots.home;
    const pkgRoot = roots.packageRoot;
    const catalog = roots.catalog || loadCatalog();
    // 1. Local installed path
    const localInstalled = join(skillDir(home, name), 'SKILL.md');
    if (existsSync(localInstalled)) {
        const content = readFileSync(localInstalled, 'utf8');
        const desc = extractDescription(content) || name;
        return def(name, content, desc);
    }
    // 2. Bundled package skills/experts
    const bundledCandidates = [
        join(pkgRoot, 'catalog', 'skills', name, 'SKILL.md'),
        join(pkgRoot, 'catalog', 'skills', `${name}.md`),
        join(pkgRoot, 'catalog', 'experts', name, 'SKILL.md'),
        join(pkgRoot, 'catalog', 'experts', name, 'skills', name, 'SKILL.md'),
        join(pkgRoot, 'catalog', 'experts', name, 'agents', `${name}.md`),
    ];
    for (const candidate of bundledCandidates) {
        if (existsSync(candidate)) {
            const content = readFileSync(candidate, 'utf8');
            const desc = extractDescription(content) || name;
            return def(name, content, desc);
        }
    }
    // Check nested skills under any expert directory in catalog/experts/
    const expertsDir = join(pkgRoot, 'catalog', 'experts');
    if (existsSync(expertsDir) && statSync(expertsDir).isDirectory()) {
        for (const expName of readdirSync(expertsDir)) {
            const candidate = join(expertsDir, expName, 'skills', name, 'SKILL.md');
            if (existsSync(candidate)) {
                const content = readFileSync(candidate, 'utf8');
                const desc = extractDescription(content) || name;
                return def(name, content, desc);
            }
        }
    }
    // 3. Catalog entry JIT install attempt
    const catalogItem = catalog.items.find(i => i.skill === name);
    if (catalogItem) {
        try {
            installItem({
                catalog,
                id: catalogItem.id,
                home,
                profileDir: join(home, 'profiles', 'omnimux'),
                packageRoot: pkgRoot,
            });
            if (existsSync(localInstalled)) {
                const content = readFileSync(localInstalled, 'utf8');
                return def(name, content, catalogItem.summary || catalogItem.title);
            }
        }
        catch {
            // ignore JIT install failure and proceed
        }
    }
    return null;
}
/**
 * Creates the OmniMux Catalog SkillProvider.
 * Exposes 100+ skills with modelInvocable: false, userInvocable: true.
 * @param {Object} [opts]
 * @param {string} [opts.home]
 * @param {string} [opts.packageRoot]
 * @param {import('./catalog.js').CatalogDoc} [opts.catalog]
 */
export function createCatalogSkillProvider(opts = {}) {
    const home = resolveHome(opts.home);
    const pkgRoot = opts.packageRoot || packageRoot();
    return {
        name: PROVIDER_NAME,
        async list() {
            const catalog = opts.catalog || loadCatalog();
            /** @type {SkillCandidate[]} */
            const candidates = [];
            const seen = new Set();
            for (const item of catalog.items) {
                if (!item.skill)
                    continue;
                if (seen.has(item.skill))
                    continue;
                seen.add(item.skill);
                // DSH validateCandidate 硬性要求 source / rank / provider 三个字段，缺一即抛错并中止注册。
                // rank 取 900（最低优先级，低于 filesystem 的 100~500 与 bundled 的 600）：
                //   - 技能已本地安装 → filesystem 低 rank 胜出 → 保持 modelInvocable:true（模型可用，无回归）
                //   - 技能仅在目录未安装 → 本提供方胜出 → modelInvocable:false（0 Token，仅 / 菜单可见）
                candidates.push({
                    name: item.skill,
                    description: item.summary || item.title || item.skill,
                    whenToUse: item.summary || undefined,
                    invocation: {
                        modelInvocable: false, // 0 Token to LLM system prompt!
                        userInvocable: true, // Appears in / slash command menu!
                    },
                    source: 'omnimux-market',
                    provider: PROVIDER_NAME,
                    rank: CATALOG_RANK,
                    locator: item.id,
                });
            }
            return { candidates, complete: true };
        },
        /**
         * @param {SkillCandidate} candidate
         * @param {unknown} [_options]
         * @returns {Promise<SkillDefinition | undefined>}
         */
        async get(candidate, _options) {
            const name = candidate?.name;
            if (typeof name !== 'string')
                return undefined;
            return resolveSkillDefinition(name, {
                home,
                packageRoot: pkgRoot,
                catalog: opts.catalog,
            }) ?? undefined;
        },
    };
}
/**
 * Register with Cordis ctx.skills if present.
 * Cordis 的 ctx 是 Proxy：访问未声明 inject 的服务（如 skills）会直接 throw
 * "cannot get property ... without inject"，可选链 ?. 无法拦截这种抛错。
 * 因此改用 try/catch 绝对防御：skills 缺失或不可注入时静默降级为空操作，
 * 绝不让插件因一个可选的技能目录注册而阻断整个 Host 启动。
 * @param {any} ctx
 * @param {Object} [opts]
 */
export function registerCatalogSkillProvider(ctx, opts = {}) {
    let skills;
    try {
        skills = ctx.skills;
    }
    catch {
        return () => { };
    }
    if (!skills || typeof skills.registerProvider !== 'function')
        return () => { };
    try {
        return skills.registerProvider(() => createCatalogSkillProvider(opts));
    }
    catch {
        return () => { };
    }
}
