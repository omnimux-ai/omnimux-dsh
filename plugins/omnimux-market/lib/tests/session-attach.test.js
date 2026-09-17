import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { clearSessionTrial, escapePromptVariables, readSessionExpert, readSessionTrial, renderAttachedExpertSection, renderAttachedTrialSection, sanitizeSessionId, sessionExpertPath, sessionIdFromExec, writeSessionExpert, writeSessionTrial, } from '../session-attach.js';
function home() {
    return mkdtempSync(join(tmpdir(), 'omx-attach-'));
}
test('sanitizeSessionId rejects path traversal', () => {
    assert.equal(sanitizeSessionId('../etc/passwd'), '');
    assert.equal(sanitizeSessionId('a/b'), '');
    assert.equal(sanitizeSessionId('sess_01.abc-2'), 'sess_01.abc-2');
});
test('write then read persists identity across process', () => {
    const h = home();
    const saved = writeSessionExpert(h, 's1', {
        id: 'exp-product-management',
        skill: 'product-management',
        title: '产品管理专家',
        kind: 'expert',
    });
    assert.equal(saved.id, 'exp-product-management');
    const again = readSessionExpert(h, 's1');
    assert.deepEqual(again, saved);
    assert.equal(sessionExpertPath(h, 's1').endsWith('omnimux-market/sessions/s1.json'), true);
});
test('renderAttachedExpertSection reloads SKILL.md from disk', () => {
    const h = home();
    mkdirSync(join(h, 'skills', 'product-management'), { recursive: true });
    writeFileSync(join(h, 'skills', 'product-management', 'SKILL.md'), '# 产品管理专家\n\n你必须先写问题陈述。\n');
    writeSessionExpert(h, 's2', {
        id: 'exp-product-management',
        skill: 'product-management',
        title: '产品管理专家',
        kind: 'expert',
    });
    const text = renderAttachedExpertSection(h, 's2');
    assert.match(text, /persistent attached plaza 专家/);
    assert.match(text, /exp-product-management/);
    assert.match(text, /你必须先写问题陈述/);
    assert.match(text, /Do not plaza_search/);
});
test('renderAttachedExpertSection escapes double braces {{...}} for DSH interpolate safety', () => {
    const h = home();
    mkdirSync(join(h, 'skills', 'dev-ops-automation-engineer'), { recursive: true });
    writeFileSync(join(h, 'skills', 'dev-ops-automation-engineer', 'SKILL.md'), '# DevOps\n\n```yaml\ndocker build -t app:${{ github.sha }} .\ndescription: "{{ $value }} errors"\n```\n');
    writeSessionExpert(h, 's-devops', {
        id: 'exp-dev-ops-automation-engineer',
        skill: 'dev-ops-automation-engineer',
        title: 'DevOps自动化工程师',
        kind: 'expert',
    });
    const text = renderAttachedExpertSection(h, 's-devops');
    assert.equal(text.includes('{{'), false, 'must not contain literal {{');
    assert.equal(text.includes('}}'), false, 'must not contain literal }}');
    // 模拟 DSH dsh-system-prompt 的 interpolate 算法，验证绝不报错
    const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/;
    const GROUP_AT = /^\{\{([^{}]*)\}\}/;
    function mockDshInterpolate(input, variables) {
        const raw = input.text;
        let result = '';
        let last = 0;
        for (let open = raw.indexOf('{{'); open >= 0; open = raw.indexOf('{{', last)) {
            const group = GROUP_AT.exec(raw.slice(open));
            if (group === null) {
                if (raw.indexOf('}}', open + 2) >= 0)
                    throw new Error(`malformed prompt variable reference in ${input.name}`);
                result += raw.slice(last, open + 2);
                last = open + 2;
                continue;
            }
            const name = group[0].slice(2, -2);
            if (!VARIABLE_NAME.test(name))
                throw new Error(`malformed prompt variable reference "{{${name}}}" in ${input.name}`);
            if (!Object.hasOwn(variables, name))
                throw new Error(`unknown prompt variable "{{${name}}}" in ${input.name}`);
            result += raw.slice(last, open) + variables[name];
            last = open + group[0].length;
        }
        return result + raw.slice(last);
    }
    assert.doesNotThrow(() => {
        mockDshInterpolate({ text, name: 'plaza:attached-expert' }, {});
    });
});
test('escapePromptVariables handles edge cases', () => {
    assert.equal(escapePromptVariables(''), '');
    assert.equal(escapePromptVariables('plain text'), 'plain text');
    const out = escapePromptVariables('{{{ triple }}} and {{ normal }} and }} only');
    assert.equal(out.includes('{{'), false);
    assert.equal(out.includes('}}'), false);
});
test('unattached session renders empty so the section is dropped', () => {
    assert.equal(renderAttachedExpertSection(home(), 'nobody'), '');
});
test('sessionIdFromExec reads header.id then agent.id (assemble path)', () => {
    assert.equal(sessionIdFromExec({ agent: { session: { header: { id: 'abc_1' } } } }), 'abc_1');
    assert.equal(sessionIdFromExec({ agent: { id: 'session-9' } }), 'session-9');
    assert.equal(sessionIdFromExec({}), '');
});
test('trial skill persists body without writing $HOME/skills', () => {
    const h = home();
    const saved = writeSessionTrial(h, 'chat-1', {
        slug: 'tiktok-market-trend-analysis',
        title: 'TikTok 市场趋势分析',
        catalogId: 'sk-tiktok-market-trend-analysis',
        body: '# 趋势分析\n\n先看品类再下结论。\n',
    });
    assert.equal(saved.slug, 'tiktok-market-trend-analysis');
    const again = readSessionTrial(h, 'chat-1');
    assert.deepEqual(again, saved);
    const text = renderAttachedTrialSection(h, 'chat-1');
    assert.match(text, /temporary trial skill/);
    assert.match(text, /NOT installed/);
    assert.match(text, /先看品类再下结论/);
    assert.equal(renderAttachedTrialSection(h, 'other'), '');
    assert.equal(clearSessionTrial(h, 'chat-1'), true);
    assert.equal(readSessionTrial(h, 'chat-1'), null);
});
