import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'CanvasPageHeader.tsx'), 'utf8');

describe('CanvasPageHeader Component', () => {
  it('defines props with workspaceId and onSwitchWorkspaceId', () => {
    assert.match(source, /workspaceId:\s*string\s*\|\s*null/);
    assert.match(source, /onSwitchWorkspaceId\?:\s*\(newWorkspaceId:\s*string\)\s*=>\s*void/);
  });

  it('renders capsule with title and more dropdown toggle button', () => {
    assert.match(source, /className="wf-page-header-capsule"/);
    assert.match(source, /className="wf-page-header-title"/);
    assert.match(source, /className="wf-page-header-more-btn"/);
  });

  it('provides dropdown list and create page button', () => {
    assert.match(source, /className="wf-page-dropdown-popover"/);
    assert.match(source, /className="wf-page-dropdown-list"/);
    assert.match(source, /className="wf-page-dropdown-create-btn"/);
    assert.match(source, /新建创作页/);
  });

  it('calls createProjectPage and triggers workspace switch', () => {
    assert.match(source, /createProjectPage\(workspaceId/);
    assert.match(source, /onSwitchWorkspaceId\(newWs\.id\)/);
  });

  it('supports selecting and activating existing pages', () => {
    assert.match(source, /setActiveProjectPage\(workspaceId,\s*page\.id\)/);
  });
});
