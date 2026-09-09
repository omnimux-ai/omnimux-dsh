import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  SESSION_HEADER_SLOT_NAME,
  SESSION_HEADER_ENTRY_ID,
} from './mountSessionHeaderActions.js';

const here = dirname(fileURLToPath(import.meta.url));
const jsxSource = readFileSync(join(here, 'SessionHeaderActions.jsx'), 'utf8');
const mountSource = readFileSync(join(here, 'mountSessionHeaderActions.js'), 'utf8');

describe('SessionHeaderActions', () => {
  it('defines the correct slot name and entry ID', () => {
    assert.equal(SESSION_HEADER_SLOT_NAME, 'conversation.session.header.utilities');
    assert.equal(SESSION_HEADER_ENTRY_ID, 'omnimux-session-header-actions');
  });

  it('renders clear and history action buttons in JSX', () => {
    assert.match(jsxSource, /清空对话并保存快照/);
    assert.match(jsxSource, /历史快照与对话记录/);
    assert.match(jsxSource, /omnimux-snapshot-popover/);
    assert.match(jsxSource, /executeSessionClearAndSnapshot/);
  });

  it('mounts to official slot in mountSessionHeaderActions', () => {
    assert.match(mountSource, /ctx\.slots\.inject\(SESSION_HEADER_SLOT_NAME/);
    assert.match(mountSource, /injectSessionHeaderStyles/);
  });
});
