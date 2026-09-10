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
    assert.match(folderCardSource, /omnimux-project-folder-card/);
    assert.match(folderCardSource, /omnimux-folder-tab-shape/);
  });

  it('renders ProjectPagesTab with creation CTA in header and page cards in grid', () => {
    assert.match(pageSource, /\+ 新建创作页/);
    assert.match(pageSource, /fetchProjectFiles/);
    assert.match(pageSource, /mkdirProjectFile/);
    assert.match(pageSource, /uploadProjectFiles/);
    assert.match(pagesTabSource, /omnimux-pages-grid/);
    assert.match(pagesTabSource, /omnimux-page-card/);
  });

  it('renders ProjectAssetsTab with FolderPlus and Upload cards and table', () => {
    assert.match(assetsTabSource, /新建文件夹/);
    assert.match(assetsTabSource, /上传文件/);
    assert.match(assetsTabSource, /全部文件/);
    assert.match(assetsTabSource, /omnimux-assets-table/);
  });
});
