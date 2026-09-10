import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'CanvasPageHeader.tsx'), 'utf8');
const componentsCss = readFileSync(join(here, '../../theme/components.css'), 'utf8');
const themeCss = readFileSync(join(here, '../../theme/workbench-theme.css'), 'utf8');

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

  it('reflects open state on controls container and provides brand color checkmark fallback', () => {
    assert.match(source, /data-open=\{isOpen \? 'true' : undefined\}/);
    assert.match(source, /color:\s*'var\(--dsw-alias-brand-primary,\s*var\(--wb-accent,\s*#4176E6\)\)'/);
  });

  it('provides clean dropdown list without redundant header row', () => {
    assert.match(source, /className="wf-page-dropdown-popover"/);
    assert.match(source, /className="wf-page-dropdown-list"/);
    assert.match(source, /className="wf-page-dropdown-create-btn"/);
    assert.match(source, /新建创作页/);
    assert.doesNotMatch(source, /wf-page-dropdown-header/);
  });

  it('popover styles specify non-transparent frosted background, backdrop-filter, border and animation', () => {
    assert.match(componentsCss, /\.wf-page-dropdown-popover\s*\{[\s\S]*?background:\s*var\(--wb-popover-bg/);
    assert.match(componentsCss, /\.wf-page-dropdown-popover\s*\{[\s\S]*?backdrop-filter:\s*var\(--wb-dock-blur/);
    assert.match(componentsCss, /\.wf-page-dropdown-popover\s*\{[\s\S]*?box-shadow:\s*var\(--wb-shadow-pop/);
    assert.match(componentsCss, /@keyframes omnimux-popover-in\s*\{/);
  });

  it('theme tokens define elevated popover background and alias fallbacks for light and dark themes', () => {
    assert.match(themeCss, /--wb-surface-elevated:\s*#ffffff/);
    assert.match(themeCss, /--wb-popover-bg:\s*rgba\(255,\s*255,\s*255,\s*0\.96\)/);
    assert.match(themeCss, /--dsw-alias-bg-elevated:\s*var\(--wb-surface-elevated\)/);
    assert.match(themeCss, /body\[data-ds-dark-theme\] \.wf-canvas-root\s*\{[\s\S]*?--wb-surface-elevated:\s*#1c1c1f/);
    assert.match(themeCss, /body\[data-ds-dark-theme\] \.wf-canvas-root\s*\{[\s\S]*?--wb-popover-bg:\s*rgba\(26,\s*27,\s*30,\s*0\.96\)/);
  });

  it('supports hovering rename pencil button and inline rename input', () => {
    assert.match(source, /className="wf-page-edit-btn"/);
    assert.match(source, /className="wf-page-rename-input"/);
    assert.match(source, /renameProjectPage/);
  });

  it('calls createProjectPage and triggers workspace switch', () => {
    assert.match(source, /createProjectPage\(workspaceId/);
    assert.match(source, /onSwitchWorkspaceId\(newWsId\)/);
  });

  it('supports selecting and activating existing pages', () => {
    assert.match(source, /setActiveProjectPage\(workspaceId,\s*page\.id\)/);
  });
});
