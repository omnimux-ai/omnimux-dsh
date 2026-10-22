import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(here, 'ProjectLibraryPage.jsx'), 'utf8');
const folderCardSource = readFileSync(join(here, 'ProjectFolderCard.jsx'), 'utf8');
const pagesTabSource = readFileSync(join(here, 'ProjectPagesTab.jsx'), 'utf8');
const assetsTabSource = readFileSync(join(here, 'ProjectAssetsTab.jsx'), 'utf8');

describe('ProjectLibraryPage Architectural Hierarchy', () => {
  it('supports folder view and detail project view with breadcrumbs', () => {
    assert.match(pageSource, /selectedProject/);
    assert.match(pageSource, /omnimux-project-breadcrumb-bar/);
    assert.match(pageSource, /项目库/);
    assert.match(pageSource, /selectedProject\.title/);
  });

  it('provides two tabs: 创作页 and 项目资产 in project detail', () => {
    assert.match(pageSource, /创作页/);
    assert.match(pageSource, /项目资产/);
    assert.match(pageSource, /<ProjectPagesTab/);
    assert.match(pageSource, /<ProjectAssetsTab/);
  });

  it('renders ProjectFolderCard for top level grid', () => {
    assert.match(pageSource, /<ProjectFolderCard/);
    assert.match(folderCardSource, /className="omnimux-folder"/);
    assert.match(folderCardSource, /omnimux-folder-pocket/);
    assert.match(folderCardSource, /<ProjectCover/);
  });

  it('renders ProjectPagesTab with creation CTA in header and page cards in grid', () => {
    assert.match(pageSource, /fetchProjectFiles/);
    assert.match(pageSource, /mkdirProjectFile/);
    assert.match(pageSource, /uploadProjectFiles/);
    assert.match(pagesTabSource, /omnimux-pages-grid/);
    assert.match(pagesTabSource, /omnimux-page-card/);
  });

  it('pairs the create-page CTA with the vector plus icon and no literal "+" (Issue #3620)', () => {
    // 契约：矢量加号由 dsh-ui-kit Button 的 leadingIcon 提供，文案不得再写字符「+」，
    // 否则渲染为两个加号，且 aria-hidden 的图标槽位会让读屏念出字符「+」。
    // 对齐 omnimux-inspiration / omnimux-publish 的 CTA 防双加号断言。
    const createPageCta = pageSource.match(/className="omnimux-create-page-btn"[\s\S]*?<\/Button>/);
    assert.ok(createPageCta, 'create-page CTA block must exist in the project detail tabs bar');
    assert.match(createPageCta[0], /leadingIcon=\{<IconPlusOutline16 \/>\}/);
    assert.match(createPageCta[0], /新建创作页/);
    assert.doesNotMatch(createPageCta[0], /\+/, 'CTA label must not carry a literal "+" next to the vector icon');
  });

  it('renders ProjectAssetsTab with FolderPlus and Upload cards and table', () => {
    assert.match(assetsTabSource, /新建文件夹/);
    assert.match(assetsTabSource, /上传文件/);
    assert.match(assetsTabSource, /全部文件/);
    assert.match(assetsTabSource, /omnimux-assets-table/);
  });

  it('handleOpenPage passes { layout, betterSidebar, t } as first arg and canvasWorkspaceId in second arg', () => {
    assert.match(pageSource, /await activateProjectCanvas\(\s*\{\s*layout,\s*betterSidebar,\s*t\s*\}/);
    assert.match(pageSource, /canvasWorkspaceId,\s*\}/);
    assert.match(pageSource, /window\.dispatchEvent\(new CustomEvent\('omnimux:active-canvas-changed'/);
  });

  it('handleCreatePageInProject updates project pages with assigned canvasWorkspaceId', () => {
    assert.match(pageSource, /const res = await createProjectPage\(selectedProject\.id, newTitle\)/);
    assert.match(pageSource, /setProjectDetail\(res\.body\.project\)/);
    assert.match(pageSource, /await loadProjectDetail\(selectedProject\)/);
  });
});
