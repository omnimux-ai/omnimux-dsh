import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const here = dirname(fileURLToPath(import.meta.url));
const plazaCardGridSrc = readFileSync(join(here, 'plaza/PlazaCardGrid.jsx'), 'utf8');
const skillPlazaSrc = readFileSync(join(here, 'skill-plaza.js'), 'utf8');
const cssSrc = readFileSync(join(here, 'css.js'), 'utf8');
const clientBundleSrc = readFileSync(join(here, '../../lib/client.js'), 'utf8');

// Compile PlazaCardGrid.jsx to CJS so Node can execute it
const compiledPlazaCardGrid = esbuild.transformSync(plazaCardGridSrc, {
  loader: 'jsx',
  format: 'cjs',
}).code;

const moduleObj = { exports: {} };
const fn = new Function('require', 'module', 'exports', compiledPlazaCardGrid);
fn(
  (id) => {
    if (id === 'react') return React;
    if (id.includes('plazaUtils')) {
      return {
        WORKSHOP_DOMAIN_ORDER: [
          '短剧漫剧',
          '专业影视',
          '动画',
          '商业广告',
          '电商',
          '教育',
          '创意实验',
          '音频音乐',
          '平台工具',
        ],
        safeTrySkillInSession: () => {},
        WorkshopSwitch: () => React.createElement('div', { className: 'switch-mock' }),
        resolveItemDesc: () => '',
        resolveItemTitle: () => '',
      };
    }
    if (id.includes('FeaturedCard')) return { renderFeaturedCard: () => null };
    return {};
  },
  moduleObj,
  moduleObj.exports,
);

const { MineToolbar, renderMineToolbar } = moduleObj.exports;

describe('MineToolbar Dropdown Filters', () => {
  it('renders default button labels as 分类 ▾ and 来源 ▾ without 全部', () => {
    const html = renderToStaticMarkup(
      React.createElement(MineToolbar, {
        mineCategory: '',
        setMineCategory: () => {},
        mineSource: '',
        setMineSource: () => {},
        availableSources: ['GitHub', 'OmniMux'],
        autoUpdate: false,
        setAutoUpdate: () => {},
        tr: (k) => (k === 'locale' ? 'zh' : (k === 'workshop.category' ? '分类' : (k === 'workshop.source' ? '来源' : ''))),
      }),
    );

    // 默认未选择时，按钮文案直接为 分类 ▾ 和 来源 ▾，不得包含 "全部" 冗余字样
    assert.match(html, /分类/);
    assert.match(html, /来源/);
    assert.doesNotMatch(html, /分类 全部/);
    assert.doesNotMatch(html, /来源 全部/);
    assert.match(html, /pill-arrow/);
  });

  it('renders localized button labels in English without All when unselected', () => {
    const enDict = {
      locale: 'en',
      'workshop.category': 'Category',
      'workshop.source': 'Source',
      'workshop.catPrefix': 'Category: ',
      'workshop.sourcePrefix': 'Source: ',
      'workshop.catAll': 'All',
    };
    const html = renderToStaticMarkup(
      React.createElement(MineToolbar, {
        mineCategory: '',
        setMineCategory: () => {},
        mineSource: '',
        setMineSource: () => {},
        availableSources: ['GitHub'],
        autoUpdate: false,
        setAutoUpdate: () => {},
        tr: (k) => enDict[k] || '',
      }),
    );

    assert.match(html, /Category/);
    assert.match(html, /Source/);
    assert.doesNotMatch(html, /Category: All/);
    assert.doesNotMatch(html, /Source: All/);
  });

  it('renders selected category and source labels in buttons', () => {
    const html = renderToStaticMarkup(
      React.createElement(MineToolbar, {
        mineCategory: '动画',
        setMineCategory: () => {},
        mineSource: 'GitHub',
        setMineSource: () => {},
        availableSources: ['GitHub', 'OmniMux'],
        autoUpdate: false,
        setAutoUpdate: () => {},
        tr: (k) => (k === 'locale' ? 'zh' : (k === 'workshop.catPrefix' ? '分类 ' : (k === 'workshop.sourcePrefix' ? '来源 ' : ''))),
      }),
    );

    assert.match(html, /分类 动画/);
    assert.match(html, /来源 GitHub/);
  });

  it('contains dropdown wrapper with relative position and menu item markup', () => {
    const html = renderToStaticMarkup(
      React.createElement(MineToolbar, {
        mineCategory: '',
        setMineCategory: () => {},
        mineSource: '',
        setMineSource: () => {},
        availableSources: ['GitHub'],
        autoUpdate: false,
        setAutoUpdate: () => {},
        tr: () => '',
      }),
    );

    assert.match(html, /class="mine-dropdown-wrap"/);
  });

  it('renderMineToolbar delegates correctly and renders MineToolbar element', () => {
    const element = renderMineToolbar({
      mineCategory: '',
      setMineCategory: () => {},
      mineSource: '',
      setMineSource: () => {},
      availableSources: ['GitHub'],
      autoUpdate: false,
      setAutoUpdate: () => {},
      tr: () => '',
    });

    assert.equal(element.type, MineToolbar);
    const html = renderToStaticMarkup(element);
    assert.match(html, /mine-toolbar/);
  });

  it('handles category dropdown toggle and item selection', () => {
    let chosenCat = null;
    const fakeState = [null, (val) => { fakeState[0] = typeof val === 'function' ? val(fakeState[0]) : val; }];
    const fakeRef = (init) => ({ current: init });
    const fakeEffect = () => {};

    // Initial render: closed
    const vdom1 = MineToolbar({
      mineCategory: '',
      setMineCategory: (c) => { chosenCat = c; },
      availableSources: ['GitHub'],
      hooks: {
        useState: () => fakeState,
        useRef: fakeRef,
        useEffect: fakeEffect,
      },
    });

    // Toggle category menu open
    const catBtn = vdom1.props.children[0].props.children[0];
    catBtn.props.onClick();
    assert.equal(fakeState[0], 'category');

    // Re-render when open
    const vdom2 = MineToolbar({
      mineCategory: '',
      setMineCategory: (c) => { chosenCat = c; },
      availableSources: ['GitHub'],
      hooks: {
        useState: () => fakeState,
        useRef: fakeRef,
        useEffect: fakeEffect,
      },
    });

    const menu = vdom2.props.children[0].props.children[1];
    assert.ok(menu, 'category menu should be open');
    const items = menu.props.children;
    // First item is all categories reset
    const allItem = items[0];
    assert.equal(allItem.key, '__all_cat__');
    allItem.props.onClick();
    assert.equal(chosenCat, '');
    assert.equal(fakeState[0], null, 'menu should close after selection');

    // Second item array has domain categories
    fakeState[0] = 'category';
    const vdom3 = MineToolbar({
      mineCategory: '',
      setMineCategory: (c) => { chosenCat = c; },
      availableSources: ['GitHub'],
      hooks: {
        useState: () => fakeState,
        useRef: fakeRef,
        useEffect: fakeEffect,
      },
    });
    const domainItem = vdom3.props.children[0].props.children[1].props.children[1][2]; // 动画
    assert.equal(domainItem.key, '动画');
    domainItem.props.onClick();
    assert.equal(chosenCat, '动画');
    assert.equal(fakeState[0], null, 'menu should close after selecting 动画');
  });

  it('handles source dropdown toggle and item selection', () => {
    let chosenSrc = null;
    const fakeState = ['source', (val) => { fakeState[0] = typeof val === 'function' ? val(fakeState[0]) : val; }];
    const fakeRef = (init) => ({ current: init });
    const fakeEffect = () => {};

    const vdom = MineToolbar({
      mineCategory: '',
      mineSource: '',
      setMineSource: (s) => { chosenSrc = s; },
      availableSources: ['GitHub', 'OmniMux'],
      hooks: {
        useState: () => fakeState,
        useRef: fakeRef,
        useEffect: fakeEffect,
      },
    });

    const srcDropdown = vdom.props.children[1];
    const srcMenu = srcDropdown.props.children[1];
    assert.ok(srcMenu, 'source menu should be open');

    const allSrcItem = srcMenu.props.children[0];
    assert.equal(allSrcItem.key, '__all_src__');
    allSrcItem.props.onClick();
    assert.equal(chosenSrc, '');
    assert.equal(fakeState[0], null);

    // Pick GitHub
    fakeState[0] = 'source';
    const vdom2 = MineToolbar({
      mineCategory: '',
      mineSource: '',
      setMineSource: (s) => { chosenSrc = s; },
      availableSources: ['GitHub', 'OmniMux'],
      hooks: {
        useState: () => fakeState,
        useRef: fakeRef,
        useEffect: fakeEffect,
      },
    });
    const gitHubItem = vdom2.props.children[1].props.children[1].props.children[1][0];
    assert.equal(gitHubItem.key, 'GitHub');
    gitHubItem.props.onClick();
    assert.equal(chosenSrc, 'GitHub');
    assert.equal(fakeState[0], null);
  });

  it('skill-plaza.js integrates MineToolbar and renderMineToolbar', () => {
    assert.match(skillPlazaSrc, /MineToolbar/);
    assert.match(skillPlazaSrc, /renderMineToolbar/);
    assert.match(skillPlazaSrc, /plazaRenderMineToolbar/);
  });

  it('css.js defines styles for dropdown wrappers, menus, items and checkmarks', () => {
    assert.match(cssSrc, /\.mine-dropdown-wrap/);
    assert.match(cssSrc, /\.mine-dropdown-menu/);
    assert.match(cssSrc, /\.mine-dropdown-item/);
    assert.match(cssSrc, /\.mine-dropdown-check/);
    assert.match(cssSrc, /\.pill-dropdown\.open/);
    assert.match(cssSrc, /\.pill-arrow/);
  });

  it('client.js bundle contains compiled MineToolbar dropdown logic', () => {
    assert.match(clientBundleSrc, /mine-dropdown-wrap/);
    assert.match(clientBundleSrc, /mine-dropdown-menu/);
    assert.match(clientBundleSrc, /mine-dropdown-item/);
    assert.match(clientBundleSrc, /mine-dropdown-check/);
  });
});
