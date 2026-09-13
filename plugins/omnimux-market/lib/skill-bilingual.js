/**
 * 技能双语字段域与准入门禁的**唯一判据**叶子模块。
 *
 * 零 IO、零外部依赖：静态门禁脚本（`scripts/verify-skill-bilingual.mjs`）、
 * 运行时工坊门禁（`workshop-query.ts`）、卡片投影（`skill-aggregate.ts`）
 * 与全部测试共用本模块，禁止在任何位置内联第二份判据。
 *
 * 契约见 `docs/contracts/skill-bilingual.md`。
 */
/**
 * 双语字段域：字段名与顺序是契约，脚本、测试、文档三处必须一致。
 * 顺序即报错输出顺序，任何新增字段都属于破坏性变更。
 */
export const SKILL_BILINGUAL_FIELDS = ['titleZh', 'titleEn', 'summaryZh', 'summaryEn'];
/** 字段长度上限：与目录解析层（`expert/catalog.js`）的裁剪保持一致。 */
export const SKILL_BILINGUAL_LIMITS = Object.freeze({
    titleZh: 80,
    titleEn: 80,
    summaryZh: 200,
    summaryEn: 200,
});
/** 门禁适用范围的人类可读口径，供脚本与文档输出复用。 */
export const OFFICIAL_SHELF_SCOPE = 'kind:skill && tab:skills && recommended:true';
/** 把任意输入收窄为普通对象记录；非对象一律视为空记录。 */
function asRecord(input) {
    return input && typeof input === 'object' ? input : {};
}
/**
 * 归一化单个双语字段：非字符串/空白 → `''`；超长 → 截断到字段上限。
 * 纯函数、无副作用；**不做任何语言回退**。
 */
export function normalizeBilingualField(value, field) {
    if (typeof value !== 'string')
        return '';
    const limit = SKILL_BILINGUAL_LIMITS[field];
    const trimmed = value.trim();
    return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
}
/**
 * 门禁唯一判据。
 *
 * 红线：**绝不「缺英文就用中文顶」**——回退即视为不通过。
 * 把 `titleEn || title` 写进判据会把「缺失任一字段即门禁不通过」静默降级为永远通过，
 * 因此本函数只读 4 个双语字段本身，不读 `title`/`summary`。
 */
export function checkSkillBilingual(input) {
    const row = asRecord(input);
    const out = {
        ok: true,
        missingFields: [],
        titleZh: '',
        titleEn: '',
        summaryZh: '',
        summaryEn: '',
    };
    for (const field of SKILL_BILINGUAL_FIELDS) {
        const value = normalizeBilingualField(row[field], field);
        out[field] = value;
        if (!value) {
            out.missingFields.push(field);
            out.ok = false;
        }
    }
    return out;
}
/**
 * 门禁适用性：仅官方货架条目（`kind===skill && tab===skills && recommended===true`）。
 *
 * 范围外条目（155 项遗留技能、用户已装技能、SkillHub/WorkBuddy 远程行）一律不判不拦。
 */
export function isOfficialShelfItem(input) {
    const row = asRecord(input);
    return String(row.kind || '') === 'skill'
        && String(row.tab || '') === 'skills'
        && row.recommended === true;
}
