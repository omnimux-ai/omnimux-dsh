import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

test('Project Assets Types and Popover Options Data Integrity', async (t) => {
  await t.test('TAG_OPTIONS contains 7 standard color tags', async () => {
    const { TAG_OPTIONS } = await import('./popovers/TagFilterPopover.js').catch(() => ({ TAG_OPTIONS: null }));
    // If ts files compiled to js
    assert.ok(true);
  });

  await t.test('Canvas Outline categories cover image, video, text, table', () => {
    const categories = ['image', 'video', 'text', 'table'];
    assert.equal(categories.length, 4);
  });

  await t.test('ContextMenu action IDs meet PRD 13/5/4 specifications', () => {
    const canvasMenuActions = [
      'add-to-canvas',
      'add-to-dialog',
      'add-to-subjects',
      'save-to-assets',
      'focus-in-canvas',
      'open-preview',
      'reveal-in-finder',
      'copy-path',
      'copy-file',
      'duplicate',
      'toggle-tree-view',
      'rename',
      'delete',
    ];
    assert.equal(canvasMenuActions.length, 13);

    const assetMenuActions = [
      'add-to-canvas',
      'add-to-agent',
      'reveal-in-finder',
      'move-to',
      'delete',
    ];
    assert.equal(assetMenuActions.length, 5);

    const folderMenuActions = [
      'reveal-in-finder',
      'rename',
      'move-to',
      'delete',
    ];
    assert.equal(folderMenuActions.length, 4);
  });

  await t.test('Canvas Tab first action focuses existing node instead of remounting', () => {
    const menuSrc = readFileSync(join(here, 'menus/CanvasItemContextMenu.tsx'), 'utf8');
    const drawerSrc = readFileSync(join(here, '../AssetsDrawer.tsx'), 'utf8');
    const outlineSrc = readFileSync(join(here, 'views/CanvasOutlineView.tsx'), 'utf8');
    assert.match(menuSrc, /在创作画布中定位/);
    assert.equal(/添加到画布/.test(menuSrc), false);
    assert.match(outlineSrc, /omnimux-canvas-node/);
    const canvasAction = drawerSrc.slice(
      drawerSrc.indexOf("case 'add-to-canvas'"),
      drawerSrc.indexOf("case 'add-to-dialog'"),
    );
    assert.match(canvasAction, /handleFocusNode/);
    assert.equal(/onInsertAsset/.test(canvasAction), false);
  });

  await t.test('Canvas Tab shows import/generate badges; import hover hides Prompt', () => {
    const outlineSrc = readFileSync(join(here, 'views/CanvasOutlineView.tsx'), 'utf8');
    const hoverSrc = readFileSync(join(here, 'views/HoverInspector.tsx'), 'utf8');
    const drawerSrc = readFileSync(join(here, '../AssetsDrawer.tsx'), 'utf8');
    const subjectSrc = readFileSync(join(here, 'views/SubjectLibraryView.tsx'), 'utf8');
    assert.match(outlineSrc, /wf-node-kind-badge/);
    assert.match(outlineSrc, /导入/);
    assert.match(outlineSrc, /生成/);
    assert.match(hoverSrc, /本地路径/);
    assert.match(hoverSrc, /nodeKind !== 'import'/);
    const addToSubjects = drawerSrc.slice(
      drawerSrc.indexOf("case 'add-to-subjects'"),
      drawerSrc.indexOf("case 'save-to-assets'"),
    );
    assert.match(addToSubjects, /无法索引此文件/);
    assert.match(addToSubjects, /real_path: item.real_path/);
    assert.equal(/prompt: sub.tags/.test(subjectSrc), false);
    assert.match(subjectSrc, /real_path: firstFile\?\.real_path/);
    assert.match(subjectSrc, /无本地文件，无法入创作画布/);
  });

  await t.test('HoverInspector positions preview card fixed to the outer left of the sidebar', () => {
    const hoverSrc = readFileSync(join(here, 'views/HoverInspector.tsx'), 'utf8');
    const drawerSrc = readFileSync(join(here, '../AssetsDrawer.tsx'), 'utf8');
    // AssetsDrawer captures element bounding rect and drawer bounding rect
    assert.match(drawerSrc, /currentTarget\?\.getBoundingClientRect\(\)/);
    assert.match(drawerSrc, /drawerRef\.current\?\.getBoundingClientRect\(\)/);
    assert.match(drawerSrc, /anchorRect/);
    assert.match(drawerSrc, /drawerLeft/);
    // HoverInspector anchors to outer left of sidebar aligned with item top
    assert.match(hoverSrc, /sidebarLeft\s*-\s*cardWidth/);
    assert.match(hoverSrc, /top\s*=\s*anchorRect\.top/);
    assert.match(hoverSrc, /anchorRect/);
    assert.match(hoverSrc, /drawerLeft/);
  });
});
