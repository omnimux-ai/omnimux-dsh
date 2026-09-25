import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
export const MCP_BEGIN = '# --- omnimux-market managed ---';
export const MCP_END = '# --- end omnimux-market managed ---';
/**
 * Package root that works in both layouts: src/expert/ during tests and
 * lib/expert/ after build (both sit two levels below the package root).
 */
export function packageRoot() {
    return join(dirname(fileURLToPath(import.meta.url)), '..', '..');
}
/**
 * @param {string | undefined} home
 */
export function resolveHome(home) {
    return home || process.env.DSH_HOME || join(homedir(), '.dsh');
}
/**
 * Resolve the profile directory that should receive MCP rows: env override
 * first (dev profiles), then derive from the install location
 * (`<profile>/node_modules/omnimux-market`), then the production default.
 * @param {string} home
 * @param {string} [profile]
 */
export function profileDir(home, profile) {
    if (profile)
        return join(home, 'profiles', profile);
    if (process.env.OMNIMUX_PLUGIN_PROFILE)
        return join(home, 'profiles', process.env.OMNIMUX_PLUGIN_PROFILE);
    const root = packageRoot();
    if (basename(dirname(root)) === 'node_modules')
        return dirname(dirname(root));
    return join(home, 'profiles', 'omnimux');
}
/**
 * @param {string} home
 * @param {string} skill
 */
export function skillDir(home, skill) {
    return join(home, 'skills', skill);
}
/**
 * @param {string} itemId
 */
export function mcpRowId(itemId) {
    return `esc-mcp-${itemId}`;
}
/**
 * 整行精确匹配某条 MCP 行的 id（`    - id: <rowId>`）。
 * 子串匹配会让 esc-mcp-cn-tencent-docs 误中 esc-mcp-cn-tencent-docs-oa（id 前缀碰撞），
 * 已装态检测必须整行比对。id 是 kebab-case 不含正则元字符，转义只是稳妥兜底。
 * @param {string} rowId 形如 `esc-mcp-<itemId>`
 */
export function mcpRowPattern(rowId) {
    const escaped = String(rowId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^[ \\t]*- id: ${escaped}[ \\t]*$`, 'm');
}
/**
 * @param {string} home
 */
export function expertModePresent(home) {
    return join(home, '.agent-presets', 'expert-mode', 'agent.cordis.yml');
}
