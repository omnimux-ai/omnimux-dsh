import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as plazaUtils from './plaza/plazaUtils.js';
import { generatePixelAvatarSvg, generatePixelAvatarDataUrl } from './plaza/pixel-avatar.js';

const here = dirname(fileURLToPath(import.meta.url));
const expertCardSrc = readFileSync(join(here, 'plaza/ExpertCard.jsx'), 'utf8');

// 把 ExpertCard.jsx 编译成 CJS，注入真实 plazaUtils 与 React 以便在 Node 里直跑。
const compiledExpertCard = esbuild.transformSync(expertCardSrc, {
  loader: 'jsx',
  format: 'cjs',
}).code;

const moduleObj = { exports: {} };
const runExpertCard = new Function('require', 'module', 'exports', compiledExpertCard);
runExpertCard(
  (id) => {
    if (id === 'react') return React;
    if (id.includes('plazaUtils')) return plazaUtils;
    return {};
  },
  moduleObj,
  moduleObj.exports,
);

const { renderExpertCard, ExpertCard } = moduleObj.exports;

const tr = (key) => (key === 'locale' ? 'zh' : '');
const cardOpts = { tr, isEn: false, expertMarketToggling: '', onToggle: () => {} };

function avatarNodeOf(item) {
  const card = renderExpertCard(item, cardOpts);
  const wrap = card.props.children[0];
  return { card, wrap, img: wrap.props.children[0], fallback: wrap.props.children[1] };
}

describe('专家卡片像素头像兜底 (Pixel Avatar Fallback)', () => {
  it('未配置 avatar 的内置预设自动使用像素头像', () => {
    const item = { id: 'standard', name: '代码开发', nameEn: 'CodeDev', description: '全栈架构设计。', avatar: '', status: 'enabled' };
    const { img } = avatarNodeOf(item);
    assert.equal(img.type, 'img');
    assert.match(img.props.src, /^data:image\/svg\+xml;charset=utf-8,/);
    assert.equal(decodeURIComponent(img.props.src.split(',').slice(1).join(',')), generatePixelAvatarSvg('standard'));
    assert.equal(img.props.alt, '代码开发');
  });

  it('完全缺失 avatar 字段的条目也不留空图', () => {
    const item = { id: 'daily-work', name: '日常工作', description: '日常办公协同。', status: 'enabled' };
    const { img } = avatarNodeOf(item);
    assert.match(img.props.src, /^data:image\/svg\+xml/);
    assert.doesNotMatch(img.props.src, /icon\?url=$/);
  });

  it('每个专家拿到各不相同且稳定的像素头像', () => {
    const ids = ['tiktok-agent', 'standard', 'daily-work', 'cordis', 'ptc', 'minimal', 'software-company'];
    const sources = ids.map((id) => avatarNodeOf({ id, name: id, avatar: '', status: 'enabled' }).img.props.src);
    assert.equal(new Set(sources).size, ids.length, '不同专家的像素头像必须互不相同');
    assert.equal(sources[0], avatarNodeOf({ id: 'tiktok-agent', name: 'tiktok-agent', avatar: '', status: 'enabled' }).img.props.src);
  });

  it('配置了 avatar 的专家仍走原图，不受像素头像影响', () => {
    const item = { id: 'shopee-ops-expert', name: 'Shopee运营专家', avatar: 'catalog/covers/expert-shopee-ops.png', status: 'enabled' };
    const { img } = avatarNodeOf(item);
    assert.match(img.props.src, /icon\?url=/);
    assert.doesNotMatch(img.props.src, /^data:image\/svg\+xml/);
  });

  it('图片加载失败先换成像素头像，再失败才退回文字首字', () => {
    const item = { id: 'cordis', name: '创造模式', avatar: 'catalog/covers/missing-file.png', status: 'enabled' };
    const { img, fallback } = avatarNodeOf(item);
    assert.equal(fallback.props.className, 'expert-card-avatar-fallback');
    assert.equal(fallback.props.style.display, 'none');

    // 用最小 DOM 形状（image + 兄弟节点）驱动 onError 的降级路径
    const fakeSibling = { style: {} };
    const fakeImg = { dataset: {}, style: {}, src: img.props.src, nextElementSibling: fakeSibling };

    img.props.onError({ currentTarget: fakeImg });
    assert.equal(fakeImg.dataset.pixelFallback, '1');
    assert.match(fakeImg.src, /^data:image\/svg\+xml;charset=utf-8,/);
    assert.equal(decodeURIComponent(fakeImg.src.split(',').slice(1).join(',')), generatePixelAvatarSvg('cordis'));
    assert.notEqual(fakeImg.style.display, 'none', '第一次失败应换成像素头像而不是直接隐藏');
    assert.notEqual(fakeSibling.style.display, 'grid', '第一次失败不应展示文字兜底');

    img.props.onError({ currentTarget: fakeImg });
    assert.equal(fakeImg.style.display, 'none');
    assert.equal(fakeSibling.style.display, 'grid');
  });

  it('data:image/svg+xml 头像经 resolveIconSrc 原样透出，不会被代理重写', () => {
    const direct = generatePixelAvatarDataUrl('html-generator');
    assert.equal(plazaUtils.resolveIconSrc(direct), direct);
    assert.equal(plazaUtils.resolveExpertAvatarSrc({ id: 'html-generator', avatar: direct }), direct);
    assert.equal(plazaUtils.resolveExpertAvatarSrc({ id: 'x', name: 'y', avatar: '   ' }), generatePixelAvatarDataUrl('x'));
    assert.equal(plazaUtils.resolveExpertAvatarSrc({ name: '仅名称' }), generatePixelAvatarDataUrl('仅名称'));
    assert.equal(plazaUtils.isPixelAvatarDataUrl(direct), true);
  });

  it('卡片可以整树渲染成静态 HTML 且带出像素头像', () => {
    const item = { id: 'ptc', name: 'PTC 模式', nameEn: 'PTC Mode', description: '功能完整的编码 Agent。', avatar: '', status: 'enabled' };
    const html = renderToStaticMarkup(React.createElement(ExpertCard, { ...cardOpts, item }));
    assert.match(html, /class="expert-card"/);
    assert.match(html, /src="data:image\/svg\+xml;charset=utf-8,/);
    assert.match(html, /PTC 模式/);
    assert.match(html, /class="expert-card-status enabled"/);
  });

  it('客户端离线兜底清单含 6 个内置预设', () => {
    const ids = plazaUtils.DEFAULT_MARKET_EXPERTS.map((it) => it.id);
    assert.deepEqual(ids.slice(0, 6), ['tiktok-agent', 'standard', 'daily-work', 'cordis', 'ptc', 'minimal']);
    assert.equal(ids.length, 14);
    for (const item of plazaUtils.BUILTIN_AGENT_PRESETS) {
      assert.equal(item.avatar, '');
      assert.equal(item.status, 'enabled');
    }
  });
});
