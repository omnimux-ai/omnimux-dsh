import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  clampRatio,
  DEFAULT_THUMB_MIN_RATIO,
  DEFAULT_THUMB_MAX_RATIO,
  DEFAULT_THUMB_FALLBACK_RATIO,
  DEFAULT_STAGE_MIN_RATIO,
  DEFAULT_STAGE_MAX_RATIO,
  DEFAULT_VIDEO_FALLBACK_RATIO,
  createMediaTailElement,
} from './assistantMessageMediaEnhancer.ts';
import { MEDIA_VIEWER_CSS } from '../media-viewer/styles.js';

test('QA-2661 场景 1：9:16 竖版立绘（0.5625）缩略图自适应纵向长矩形，头脚不截断', async () => {
  // 1. 算法计算精确性
  const ratio = clampRatio(1080, 1920);
  assert.equal(ratio, 0.5625, '9:16 比例必须精确输出 0.5625');

  // 2. DOM 节点动态自适应
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const doc = dom.window.document;
  const items = [
    { url: 'http://example.com/portrait-hero.png', type: 'image', title: '9:16立绘' },
    { url: 'http://example.com/other.png', type: 'image', title: '其他素材' },
  ];
  const gallery = createMediaTailElement(items, doc);
  doc.body.appendChild(gallery);

  const thumb0 = gallery.querySelectorAll('.omx-chat-media-tail__thumb')[0];
  const img0 = thumb0.querySelector('img');
  assert.ok(img0, '缩略图内必须存在 img 元素');

  // 模拟图片加载 1080x1920
  Object.defineProperty(img0, 'naturalWidth', { value: 1080, configurable: true });
  Object.defineProperty(img0, 'naturalHeight', { value: 1920, configurable: true });
  img0.dispatchEvent(new dom.window.Event('load'));

  assert.match(thumb0.style.aspectRatio, /^0\.5625(\s*\/\s*1)?$/, '缩略图容器比例必须自适应为 0.5625 纵向长矩形');

  // 3. 样式与几何防截断契约
  assert.match(MEDIA_VIEWER_CSS, /\.omx-chat-media-tail__thumb img[^}]+object-fit:\s*cover/, '缩略图图片必须声明 object-fit: cover');
});

test('QA-2661 场景 2：16:9 横版宽屏（1.7778）缩略图自适应横向画幅', async () => {
  // 1. 算法计算精确性
  const ratio = clampRatio(1920, 1080);
  assert.equal(ratio, 1.7778, '16:9 比例必须输出四位小数 1.7778');

  // 2. 视频缩略图动态自适应
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const doc = dom.window.document;
  const items = [
    { url: 'http://example.com/widescreen.mp4', type: 'video', title: '16:9宽屏视频' },
    { url: 'http://example.com/dummy.png', type: 'image' },
  ];
  const gallery = createMediaTailElement(items, doc);
  doc.body.appendChild(gallery);

  const thumb0 = gallery.querySelectorAll('.omx-chat-media-tail__thumb')[0];
  const vid0 = thumb0.querySelector('video');
  assert.ok(vid0, '缩略图内必须存在 video 元素');

  // 模拟视频 loadedmetadata 1920x1080
  Object.defineProperty(vid0, 'videoWidth', { value: 1920, configurable: true });
  Object.defineProperty(vid0, 'videoHeight', { value: 1080, configurable: true });
  vid0.dispatchEvent(new dom.window.Event('loadedmetadata'));

  assert.match(thumb0.style.aspectRatio, /^1\.7778(\s*\/\s*1)?$/, '视频缩略图必须自适应为 1.7778 横向画幅');
});

test('QA-2661 场景 3：1:1 正方形插画（1.0）缩略图自适应正方形', async () => {
  // 1. 算法计算精确性
  const ratio = clampRatio(1024, 1024);
  assert.equal(ratio, 1.0, '1:1 正方形比例必须输出 1.0');

  // 2. DOM 载入验证
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const doc = dom.window.document;
  const items = [
    { url: 'http://example.com/square.png', type: 'image', title: '1:1插画' },
    { url: 'http://example.com/dummy.png', type: 'image' },
  ];
  const gallery = createMediaTailElement(items, doc);
  doc.body.appendChild(gallery);

  const thumb0 = gallery.querySelectorAll('.omx-chat-media-tail__thumb')[0];
  const img0 = thumb0.querySelector('img');

  Object.defineProperty(img0, 'naturalWidth', { value: 1024, configurable: true });
  Object.defineProperty(img0, 'naturalHeight', { value: 1024, configurable: true });
  img0.dispatchEvent(new dom.window.Event('load'));

  assert.match(thumb0.style.aspectRatio, /^1(\.0+)?(\s*\/\s*1)?$/, '正方形缩略图必须保持 1.0');
});

test('QA-2661 场景 4：极限超高/超宽尺寸被安全钳制在 [0.5, 2.0]，主舞台钳制在 [0.25, 4.0]', async () => {
  // 1. 缩略图极限钳制 [0.5, 2.0]
  assert.equal(clampRatio(100, 1000), DEFAULT_THUMB_MIN_RATIO, '超高素材 1:10 缩略图必须被安全钳制在 0.5');
  assert.equal(clampRatio(50, 2000), 0.5, '极度超高素材 1:40 缩略图必须被安全钳制在 0.5');
  assert.equal(clampRatio(3000, 300), DEFAULT_THUMB_MAX_RATIO, '超宽素材 10:1 缩略图必须被安全钳制在 2.0');
  assert.equal(clampRatio(10000, 500), 2.0, '极度超宽素材 20:1 缩略图必须被安全钳制在 2.0');

  // 2. 主舞台极限钳制 [0.25, 4.0]
  const stageConfig = {
    minRatio: DEFAULT_STAGE_MIN_RATIO,
    maxRatio: DEFAULT_STAGE_MAX_RATIO,
    fallbackRatio: 1.0,
  };
  assert.equal(DEFAULT_STAGE_MIN_RATIO, 0.25, '主舞台最小比例常量必须为 0.25');
  assert.equal(DEFAULT_STAGE_MAX_RATIO, 4.0, '主舞台最大比例常量必须为 4.0');
  assert.equal(clampRatio(100, 1000, stageConfig), 0.25, '超高素材 1:10 主舞台必须被安全钳制在 0.25');
  assert.equal(clampRatio(100, 2000, stageConfig), 0.25, '极度超高 1:20 主舞台必须被安全钳制在 0.25');
  assert.equal(clampRatio(5000, 500, stageConfig), 4.0, '超宽素材 10:1 主舞台必须被安全钳制在 4.0');
  assert.equal(clampRatio(12000, 1000, stageConfig), 4.0, '超宽全景 12:1 主舞台必须被安全钳制在 4.0');

  // 3. 边界配置鲁棒性防御（反转参数自动修正）
  assert.equal(clampRatio(100, 200, { minRatio: 2.0, maxRatio: 0.5 }), 0.5, '反向 min/max 配置必须自动互换纠正');
});

test('QA-2661 场景 5：视频与图片加载异常（error）时安全自愈回退', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const doc = dom.window.document;
  const items = [
    { url: 'http://example.com/broken-img.png', type: 'image', title: '损坏图片' },
    { url: 'http://example.com/broken-vid.mp4', type: 'video', title: '损坏视频' },
  ];
  const gallery = createMediaTailElement(items, doc);
  doc.body.appendChild(gallery);

  const thumbs = gallery.querySelectorAll('.omx-chat-media-tail__thumb');
  const mainStage = gallery.querySelector('.omx-chat-media-tail__main');
  assert.ok(mainStage);

  // 1. 缩略图图片 error 触发
  const thumbImg = thumbs[0].querySelector('img');
  thumbImg.dispatchEvent(new dom.window.Event('error'));
  assert.match(thumbs[0].style.aspectRatio, /^1(\.0+)?(\s*\/\s*1)?$/, '损坏图片缩略图必须自愈回退为 1.0');

  // 2. 主舞台图片 error 触发
  const mainImg = gallery.querySelector('.omx-chat-media-tail__main-content img');
  assert.ok(mainImg);
  mainImg.dispatchEvent(new dom.window.Event('error'));
  assert.match(mainStage.style.aspectRatio, /^1(\.0+)?(\s*\/\s*1)?$/, '主舞台图片加载失败必须回退为兜底比例 1.0');

  // 3. 切换至视频素材
  thumbs[1].click();

  // 4. 缩略图视频 error 触发
  const thumbVid = thumbs[1].querySelector('video');
  thumbVid.dispatchEvent(new dom.window.Event('error'));
  assert.match(thumbs[1].style.aspectRatio, /^1(\.0+)?(\s*\/\s*1)?$/, '损坏视频缩略图必须自愈回退为 1.0');

  // 5. 主舞台视频 error 触发
  const mainVid = gallery.querySelector('.omx-chat-media-tail__main-content video');
  assert.ok(mainVid);
  mainVid.dispatchEvent(new dom.window.Event('error'));
  assert.match(mainStage.style.aspectRatio, /^1\.7778(\s*\/\s*1)?$|^16\s*\/\s*9$/, '主舞台视频加载失败必须回退为 16:9 兜底');
});

test('QA-2661 场景 6：视频切片切换代次守卫（generation counter）防异步竞态覆盖', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const doc = dom.window.document;
  const items = [
    { url: 'http://example.com/item1.png', type: 'image' },
    { url: 'http://example.com/item2-slow-vid.mp4', type: 'video' },
    { url: 'http://example.com/item3.png', type: 'image' },
  ];
  const gallery = createMediaTailElement(items, doc);
  doc.body.appendChild(gallery);

  const thumbs = gallery.querySelectorAll('.omx-chat-media-tail__thumb');
  const mainStage = gallery.querySelector('.omx-chat-media-tail__main');

  // 1. 点选切换到视频（切片 2）
  thumbs[1].click();
  const slowVid = mainStage.querySelector('video');
  assert.ok(slowVid, '切片 2 必须渲染 video 元素');

  // 2. 用户快速切换到切片 3（图片）
  thumbs[2].click();
  const currentImg = mainStage.querySelector('img');
  assert.ok(currentImg, '切片 3 必须渲染 img 元素');
  // 初始为安全比例 1.0
  assert.match(mainStage.style.aspectRatio, /^1(\.0+)?(\s*\/\s*1)?$/);

  // 3. 此时切片 2 的旧视频发生迟到的 loadedmetadata 回包（尺寸 21:9 超宽画幅 2560x1080）
  Object.defineProperty(slowVid, 'videoWidth', { value: 2560, configurable: true });
  Object.defineProperty(slowVid, 'videoHeight', { value: 1080, configurable: true });
  slowVid.dispatchEvent(new dom.window.Event('loadedmetadata'));

  // 4. 确凿断言：主舞台比例未被迟到的切片 2 覆盖！
  assert.match(mainStage.style.aspectRatio, /^1(\.0+)?(\s*\/\s*1)?$/, '代次守卫必须彻底拦截过期视频 loadedmetadata');

  // 5. 此时切片 2 的旧视频发生迟到的 error 事件
  slowVid.dispatchEvent(new dom.window.Event('error'));
  assert.match(mainStage.style.aspectRatio, /^1(\.0+)?(\s*\/\s*1)?$/, '代次守卫必须彻底拦截过期视频 error 事件');
});

test('QA-2661 场景 7：缩略图轨道 8px 弱化遮罩与 padding: 4px 3px 不切断边框', async () => {
  // 1. 验证 padding 从旧版 2px 3px 规范为 4px 3px
  assert.match(MEDIA_VIEWER_CSS, /\.omx-chat-media-tail__rail\s*\{[^}]*padding:\s*4px 3px;/, '缩图轨道内边距必须严格对齐为 padding: 4px 3px;');

  // 2. 验证滚动渐隐遮罩由 16px 收敛弱化为 8px
  assert.match(
    MEDIA_VIEWER_CSS,
    /\.omx-chat-media-tail__rail\.cs-down\s*\{[^}]*linear-gradient\(to bottom,\s*black 0,\s*black calc\(100% - 8px\),\s*transparent 100%\)/,
    '向下滚动遮罩必须弱化为 8px'
  );
  assert.match(
    MEDIA_VIEWER_CSS,
    /\.omx-chat-media-tail__rail\.cs-up\s*\{[^}]*linear-gradient\(to bottom,\s*transparent 0,\s*black 8px,\s*black 100%\)/,
    '向上滚动遮罩必须弱化为 8px'
  );
  assert.match(
    MEDIA_VIEWER_CSS,
    /\.omx-chat-media-tail__rail\.cs-up\.cs-down\s*\{[^}]*linear-gradient\(to bottom,\s*transparent 0,\s*black 8px,\s*black calc\(100% - 8px\),\s*transparent 100%\)/,
    '双向滚动遮罩必须弱化为 8px'
  );

  // 3. 验证不再残留任何 16px 渐隐遮罩
  assert.doesNotMatch(
    MEDIA_VIEWER_CSS,
    /\.omx-chat-media-tail__rail[^{]*\{[^}]*16px/,
    '缩图栏遮罩严禁残留旧版 16px 粗暴遮罩'
  );
});

test('QA-2661 场景 8：SaaS 极简文案与 UI 零越权审计（PRD & UI Lock）', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const doc = dom.window.document;
  const items = [
    { url: 'http://example.com/1.png', type: 'image' },
    { url: 'http://example.com/2.mp4', type: 'video' },
  ];
  const gallery = createMediaTailElement(items, doc);
  doc.body.appendChild(gallery);

  // 1. 悬浮画布按钮文案与图标
  const canvasBtns = gallery.querySelectorAll('.omx-chat-media-tail__canvas-btn');
  assert.ok(canvasBtns.length > 0, '必须渲染画布按钮');
  for (const btn of canvasBtns) {
    assert.equal(btn.getAttribute('aria-label'), '进入画布', '按钮 aria-label 必须锁定为「进入画布」');
    assert.equal(btn.getAttribute('title'), '进入画布', '按钮 title 必须锁定为「进入画布」');
    assert.equal(btn.querySelector('span')?.textContent, '画布', '按钮展示文字必须锁定为「画布」');
    assert.ok(btn.querySelector('svg'), '按钮必须包含矢量 SVG 调色盘图标');
  }

  // 2. 视频角标
  const videoDur = gallery.querySelector('.omx-chat-media-tail__dur');
  assert.ok(videoDur, '视频缩略图必须带有角标');
  assert.equal(videoDur.textContent, '视频', '视频角标文案必须锁定为「视频」');

  // 3. 越权 Emoji 与营销标签审计
  const textContent = gallery.textContent || '';
  assert.doesNotMatch(textContent, /💎|🔥|✨|🚀|⚡/, '严禁出现任何未经授权的 Emoji');
  assert.doesNotMatch(textContent, /新品|推荐|极速|画质版|精细成品|快速迭代/, '严禁出现任何未授权的 Badge 营销标签');
});
