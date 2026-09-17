import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const MAX_SKILL_CHARS = 24_000;
/** 会话 id 只允许落盘安全字符，防止路径穿越。 */
export function sanitizeSessionId(raw) {
    const id = String(raw || '').trim();
    if (!id || id.length > 180)
        return '';
    if (!/^[A-Za-z0-9._-]+$/.test(id))
        return '';
    return id;
}
/** `$DSH_HOME/omnimux-market/sessions/<sessionId>.json` */
export function sessionExpertPath(home, sessionId) {
    const id = sanitizeSessionId(sessionId);
    if (!id)
        return '';
    return join(home, 'omnimux-market', 'sessions', `${id}.json`);
}
export function readSessionExpert(home, sessionId) {
    const path = sessionExpertPath(home, String(sessionId || ''));
    if (!path || !existsSync(path))
        return null;
    try {
        const raw = JSON.parse(readFileSync(path, 'utf8'));
        const id = String(raw.id || '').trim();
        const skill = String(raw.skill || '').trim();
        if (!id || !skill)
            return null;
        return {
            id,
            skill,
            title: String(raw.title || id),
            kind: String(raw.kind || 'expert'),
            attachedAt: String(raw.attachedAt || ''),
        };
    }
    catch {
        return null;
    }
}
export function writeSessionExpert(home, sessionId, attach) {
    const path = sessionExpertPath(home, String(sessionId || ''));
    if (!path)
        throw new Error('invalid session id');
    const payload = {
        id: String(attach.id).trim(),
        skill: String(attach.skill).trim(),
        title: String(attach.title || attach.id).trim(),
        kind: String(attach.kind || 'expert').trim() || 'expert',
        attachedAt: attach.attachedAt || new Date().toISOString(),
    };
    if (!payload.id || !payload.skill)
        throw new Error('attach requires id and skill');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
    return payload;
}
export function loadSkillBody(home, skill) {
    const dest = join(home, 'skills', skill, 'SKILL.md');
    if (!existsSync(dest))
        return '';
    try {
        return readFileSync(dest, 'utf8');
    }
    catch {
        return '';
    }
}
/**
 * DSH systemPrompt.section interpolates any `{{...}}` as a template variable reference.
 * External skill/expert instructions often include `{{...}}` in code snippets (GitHub Actions,
 * Prometheus alerts, Jinja/Vue templates, etc.). Inserting a zero-width space between double
 * braces prevents DSH from parsing them as variable interpolations while preserving the exact
 * visual text for the model.
 */
export function escapePromptVariables(text) {
    if (!text || (!text.includes('{{') && !text.includes('}}')))
        return text;
    return text.replace(/\{(?=\{)/g, '{\u200B').replace(/\}(?=\})/g, '}\u200B');
}
/**
 * 每步系统提示用的身份段。挂上后跨轮、重启、压缩后都从落盘重读。
 * 空串表示本会话未挂专家，组装时会被丢掉。
 */
export function renderAttachedExpertSection(home, sessionId) {
    const attach = readSessionExpert(home, sessionId);
    if (!attach)
        return '';
    const body = loadSkillBody(home, attach.skill);
    const truncated = body.length > MAX_SKILL_CHARS;
    const skillText = truncated ? `${body.slice(0, MAX_SKILL_CHARS)}\n\n…(instructions truncated; call the skill tool with "${attach.skill}" for the rest)` : body;
    const kindLabel = attach.kind === 'team' ? '专家团' : '专家';
    const raw = [
        `This session has a persistent attached plaza ${kindLabel}: 「${attach.title}」 (catalog id ${attach.id}, skill ${attach.skill}).`,
        'Stay in this role for the rest of the session. Do not plaza_search or recommend a different expert unless the user explicitly asks to switch.',
        'The slash gesture only injects a skill for one step. This attachment is the durable identity: reload it from here even if later user messages omit /skill.',
        skillText
            ? `Follow these expert instructions:\n\n${skillText}`
            : `Expert skill "${attach.skill}" is installed. Call the skill tool with that exact name before acting, then stay in character.`,
    ].join('\n');
    return escapePromptVariables(raw);
}
/** 从工具 exec 抠会话 id；测例可以不传。 */
export function sessionIdFromExec(exec) {
    const agent = exec?.agent;
    const raw = agent?.session?.header?.id ?? agent?.session?.id ?? agent?.id;
    return sanitizeSessionId(raw);
}
/** `$DSH_HOME/omnimux-market/sessions/<sessionId>.trial.json` */
export function sessionTrialPath(home, sessionId) {
    const id = sanitizeSessionId(sessionId);
    if (!id)
        return '';
    return join(home, 'omnimux-market', 'sessions', `${id}.trial.json`);
}
export function readSessionTrial(home, sessionId) {
    const path = sessionTrialPath(home, String(sessionId || ''));
    if (!path || !existsSync(path))
        return null;
    try {
        const raw = JSON.parse(readFileSync(path, 'utf8'));
        const slug = String(raw.slug || '').trim();
        if (!slug)
            return null;
        return {
            slug,
            title: String(raw.title || slug),
            catalogId: String(raw.catalogId || ''),
            body: String(raw.body || ''),
            attachedAt: String(raw.attachedAt || ''),
        };
    }
    catch {
        return null;
    }
}
export function writeSessionTrial(home, sessionId, trial) {
    const path = sessionTrialPath(home, String(sessionId || ''));
    if (!path)
        throw new Error('invalid session id');
    const body = String(trial.body || '');
    const payload = {
        slug: String(trial.slug).trim(),
        title: String(trial.title || trial.slug).trim(),
        catalogId: String(trial.catalogId || '').trim(),
        body: body.length > MAX_SKILL_CHARS ? body.slice(0, MAX_SKILL_CHARS) : body,
        attachedAt: trial.attachedAt || new Date().toISOString(),
    };
    if (!payload.slug)
        throw new Error('trial requires slug');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
    return payload;
}
export function clearSessionTrial(home, sessionId) {
    const path = sessionTrialPath(home, String(sessionId || ''));
    if (!path || !existsSync(path))
        return false;
    try {
        unlinkSync(path);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * 每步系统提示用的临时技能段。挂上后跨轮从落盘重读；不写入安装目录。
 * 空串表示本会话未试用技能。
 */
export function renderAttachedTrialSection(home, sessionId) {
    const trial = readSessionTrial(home, sessionId);
    if (!trial)
        return '';
    const truncated = trial.body.length >= MAX_SKILL_CHARS;
    const skillText = truncated
        ? `${trial.body}\n\n…(instructions truncated)`
        : trial.body;
    const raw = [
        `This session has a temporary trial skill 「${trial.title}」 (slug ${trial.slug}). It is NOT installed into the skill library.`,
        'Follow these instructions for this session only. Do not treat this as a durable install. Do not recommend installing unless the user explicitly asks.',
        skillText
            ? `Follow these skill instructions:\n\n${skillText}`
            : `Temporary skill "${trial.slug}" is selected, but its instruction body is unavailable. Continue with the skill name and the user's message; do not invent missing instructions.`,
    ].join('\n');
    return escapePromptVariables(raw);
}
