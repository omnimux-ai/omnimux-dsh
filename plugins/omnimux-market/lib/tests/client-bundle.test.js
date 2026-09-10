import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const client = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../client.js'), 'utf8');
test('client bundle is a single ModuleLoader factory', () => {
    assert.match(client, /^window\.__ModuleLoader__\.load\(\{/);
    assert.match(client, /id: "omnimux-market"/);
    assert.match(client, /return module\.exports/);
    assert.match(client, /inject/);
    assert.match(client, /function apply/);
});
test('client bundle inlines dsh-ui-kit and externalizes host modules', () => {
    assert.doesNotMatch(client, /require\(["']dsh-ui-kit["']\)/);
    assert.match(client, /require\(["']react["']\)/);
    assert.match(client, /require\(["']@deepseek-ai\/dsh-client-ui-primitives["']\)/);
    assert.match(client, /SearchField|dshUk-SearchField/);
    assert.match(client, /dshUk-Button/);
});
test('client bundle has no runtime relative require (logic is inlined)', () => {
    assert.doesNotMatch(client, /require\(["']\.\//);
    assert.doesNotMatch(client, /require\(["']\.\.\//);
});
test('client bundle inlines the shelf taxonomy keywords', () => {
    assert.match(client, /shopify/);
    assert.match(client, /独立站/);
    assert.match(client, /选品/);
});
test('client bundle keeps public slot keys and workbench tab registration', () => {
    for (const needle of [
        'key: "skillhub_search"',
        'key: "plaza_search"',
        'key: "skillhub_list"',
        'key: "omnimux-market"',
        'settings.plugin.item',
        'omnimux-market:plaza',
        '__omnimuxSidebar',
        'omnimux-market-entry',
        'conversation.input.left',
        'omnimux-market-skill-picker',
        'data-omnimux-skill-picker',
        'omnimux-market:plaza-intent',
        'sk-omx-skill-creator',
        'data-omnimux-market-entry',
        'renderPlazaIcon',
        'Skills',
    ]) {
        assert.ok(client.includes(needle), `missing ${needle}`);
    }
    assert.ok(!client.includes('PlazaFocusBar'), 'in-tab FocusBar removed');
    assert.ok(!client.includes('omnimux-workbench-focus'), 'in-tab FocusBar styles/markers removed');
    assert.ok(!client.includes('slots.inject("sidebar.footer.action"'), 'footer action removed');
    assert.ok(!client.includes('icon: () => h(PlazaIcon)'), 'tab icon must accept size');
});
