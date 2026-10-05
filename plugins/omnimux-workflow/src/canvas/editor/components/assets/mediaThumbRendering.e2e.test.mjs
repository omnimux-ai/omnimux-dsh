/**
 * E2E 契约：资产抽屉的缩略图必须按媒体类型分派渲染（Issue #3107）。
 *
 * 缺陷根因是渲染侧无条件把 `previewUrl` 交给 `<img>`——导入的本地视频与音频
 * 共用同一个 `/api/local-file?path=<绝对路径>` 地址，`<img>` 解码失败只剩破图。
 * 本用例把「五处渲染点统一走 MediaThumb」与「video 在三种容器内都具备尺寸规则」
 * 钉成源码契约，防止任一渲染点回退成裸 `<img>`。
 *
 * 位置说明：本仓插件目录下的 tests/e2e 子目录不在插件 test 脚本的 glob 内
 * （glob 只覆盖 src 下的 test 文件与 tests 根目录一层），因此把契约用例放在
 * 被测源码同级，确保它随常规测试套件一起执行、真正成为回归门禁。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const viewsDir = join(here, 'views');
const cssPath = join(here, '../../../theme/components.css');

const read = (path) => readFileSync(path, 'utf8');

const RENDER_SITES = [
  ['CanvasOutlineView.tsx', '创作画布列表 / 网格'],
  ['ProjectAssetsView.tsx', '资产页签列表 / 网格'],
  ['HoverInspector.tsx', '悬停预览卡'],
].map(([file, label]) => [file, read(join(viewsDir, file)), label]);

const mediaThumb = read(join(here, 'MediaThumb.tsx'));
const css = read(cssPath);

const MEDIA_FIELDS = 'previewUrl|mediaUrl|thumbnailUrl|outputVideoUrl|coverUrl';
const BARE_IMG_RE = new RegExp(`<img[^>]*src=\\{[^}]*(${MEDIA_FIELDS})[^}]*\\}`, 'g');

/** 返回仍把媒体预览地址直接交给 <img> 的渲染点。 */
function bareImgSites() {
  return RENDER_SITES.filter(([, src]) => new RegExp(BARE_IMG_RE.source).test(src)).map(([file]) => file);
}

/** 返回已改用共享 MediaThumb 的渲染点。 */
function mediaThumbSites() {
  return RENDER_SITES.filter(
    ([, src]) => /import\s*\{\s*MediaThumb\s*\}\s*from\s*'\.\.\/MediaThumb'/.test(src) && /<MediaThumb/.test(src),
  ).map(([file]) => file);
}

test('E2E: 资产抽屉缩略图按媒体类型分派（Issue #3107）', async (t) => {
  await t.test('预览地址不得再被裸 <img> 承接（缺陷回归门禁）', () => {
    // 修复前：CanvasOutlineView / ProjectAssetsView / HoverInspector 三处均为裸 <img>。
    assert.equal(bareImgSites().length, 0, `仍有渲染点把媒体预览地址交给 <img>：${bareImgSites().join(', ')}`);
  });

  await t.test('三个视图全部改用共享 MediaThumb', () => {
    assert.equal(
      mediaThumbSites().length,
      RENDER_SITES.length,
      `未改用 MediaThumb 的渲染点：${RENDER_SITES.map(([f]) => f)
        .filter((f) => !mediaThumbSites().includes(f))
        .join(', ')}`,
    );
  });

  await t.test('MediaThumb 视频分支使用首帧可取的 <video>，图片分支仍用 <img>', () => {
    assert.equal(/mode === 'video'/.test(mediaThumb), true, '必须存在 video 分支');
    assert.equal(
      /<video[\s\S]*?preload="metadata"[\s\S]*?\/>/.test(mediaThumb),
      true,
      '视频缩略图必须以 preload="metadata" 渲染，避免整片下载',
    );
    assert.equal(/\bmuted\b/.test(mediaThumb), true, '缩略图视频必须静音');
    assert.equal(/\bplaysInline\b/.test(mediaThumb), true, '缩略图视频必须 playsInline，禁止全屏接管');
    assert.equal(
      /onLoadedMetadata=\{[\s\S]*?currentTime[\s\S]*?\}/.test(mediaThumb),
      true,
      '视频缩略图必须在元数据就绪后定位到首帧',
    );
    assert.equal(
      /<img className=\{className\} src=\{href\} alt=\{alt\} \/>/.test(mediaThumb),
      true,
      '图片分支仍渲染 <img>',
    );
  });

  await t.test('纯函数分派：地址扩展名优先，声明类型兜底', () => {
    const mode = read(join(here, 'mediaThumbMode.ts'));
    const videoIdx = mode.indexOf('VIDEO_EXTENSIONS.has(ext)');
    const declaredIdx = mode.indexOf("declared === 'video'");
    assert.equal(/export function resolveThumbMode/.test(mode), true, '必须导出 resolveThumbMode');
    assert.equal(videoIdx > -1 && declaredIdx > -1 && videoIdx < declaredIdx, true, '扩展名判定必须先于声明类型兜底');
  });

  await t.test('三种容器内的 video 与 img 共享同一尺寸规则', () => {
    assert.equal(
      /\.wf-grid-card-thumb-compact\s+img,\s*\.wf-grid-card-thumb-compact\s+video\s*\{[^}]*object-fit:\s*cover;/.test(css),
      true,
      '网格卡必须同时为 img 与 video 提供尺寸与裁切规则',
    );
    assert.equal(
      /\.wf-tree-file-thumb-compact\s*\{[^}]*object-fit:\s*cover;/.test(css),
      true,
      '列表行缩略图类必须自带尺寸与裁切，video 沿用同一类',
    );
    assert.equal(
      /\.wf-hover-inspector-img\s*\{[^}]*object-fit:\s*cover;/.test(css),
      true,
      '悬停预览图类必须自带尺寸与裁切，video 沿用同一类',
    );
  });
});
