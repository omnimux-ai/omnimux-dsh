import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { MEDIA_VIEWER_CSS } from './styles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('MediaViewer UI Polish & Spec Compliance', () => {
  it('Step 1: 比例线框几何与 20px 居中盒规范（解决 3px 小黑点塌缩）', () => {
    // 基础线框属性
    assert.match(MEDIA_VIEWER_CSS, /\.omx-ratio-wire\s*\{[^}]*border:\s*1\.5px solid var\(--dsw-alias-label-secondary\)/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-ratio-wire\s*\{[^}]*border-radius:\s*2px/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-ratio-wire\s*\{[^}]*box-sizing:\s*border-box/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-ratio-card\.is-active \.omx-ratio-wire\s*\{[^}]*border-color:\s*var\(--dsw-alias-label-primary\)/);

    // 20px 居中盒规范
    assert.match(MEDIA_VIEWER_CSS, /\.omx-ratio-wire-box\s*\{[^}]*width:\s*20px;\s*height:\s*20px;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-ratio-wire-box\s*\{[^}]*display:\s*flex;\s*align-items:\s*center;\s*justify-content:\s*center;/);

    // 7 款比例精准几何尺寸
    assert.match(MEDIA_VIEWER_CSS, /\.ratio-1-1\s*\{[^}]*width:\s*16px;\s*height:\s*16px;/);
    assert.match(MEDIA_VIEWER_CSS, /\.ratio-16-9\s*\{[^}]*width:\s*20px;\s*height:\s*11px;/);
    assert.match(MEDIA_VIEWER_CSS, /\.ratio-9-16\s*\{[^}]*width:\s*11px;\s*height:\s*20px;/);
    assert.match(MEDIA_VIEWER_CSS, /\.ratio-4-3\s*\{[^}]*width:\s*18px;\s*height:\s*14px;/);
    assert.match(MEDIA_VIEWER_CSS, /\.ratio-3-4\s*\{[^}]*width:\s*14px;\s*height:\s*18px;/);
    assert.match(MEDIA_VIEWER_CSS, /\.ratio-21-9\s*\{[^}]*width:\s*20px;\s*height:\s*9px;/);
    assert.match(MEDIA_VIEWER_CSS, /\.ratio-auto\s*\{[^}]*width:\s*16px;\s*height:\s*12px;\s*border-style:\s*dashed;/);
  });

  it('Step 2: 声音分段与图文排版规范（.omx-inline-flex-center）', () => {
    assert.match(MEDIA_VIEWER_CSS, /\.omx-inline-flex-center\s*\{[^}]*display:\s*inline-flex;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-inline-flex-center\s*\{[^}]*align-items:\s*center;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-inline-flex-center\s*\{[^}]*justify-content:\s*center;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-inline-flex-center\s*\{[^}]*gap:\s*4px;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-inline-flex-center svg\s*\{[^}]*width:\s*12px;\s*height:\s*12px;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-inline-flex-center span\s*\{[^}]*font-size:\s*12px;/);
  });

  it('Step 3: 分段控制器（Track & Pill）对齐 design.md §2.2', () => {
    // Track 容器几何与圆角
    assert.match(MEDIA_VIEWER_CSS, /\.omx-mode-track\s*\{[^}]*height:\s*32px;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-mode-track\s*\{[^}]*padding:\s*2px;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-mode-track\s*\{[^}]*gap:\s*2px;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-mode-track\s*\{[^}]*border-radius:\s*999px;/);

    // Pill 内块几何、圆角与过渡
    assert.match(MEDIA_VIEWER_CSS, /\.omx-mode-pill\s*\{[^}]*height:\s*26px;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-mode-pill\s*\{[^}]*padding:\s*0 10px;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-mode-pill\s*\{[^}]*border-radius:\s*999px;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-mode-pill\s*\{[^}]*font-size:\s*12px;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-mode-pill\.is-active\s*\{[^}]*background:\s*var\(--dsw-alias-bg-elevated,\s*#1c1c1f\);/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-mode-pill\.is-active\s*\{[^}]*color:\s*var\(--dsw-alias-label-primary\);/);
  });

  it('Step 4: 底栏触发器胶囊微观基线与图标垂直对齐', () => {
    assert.match(MEDIA_VIEWER_CSS, /\.omx-capsule-trigger svg\s*\{[^}]*display:\s*block;\s*flex-shrink:\s*0;\s*vertical-align:\s*middle;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-param-duration-label\s*\{[^}]*display:\s*inline-flex;\s*align-items:\s*center;\s*gap:\s*3px;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-dot\s*\{[^}]*display:\s*inline-block;[^}]*user-select:\s*none;/);
  });

  it('Step 5: MediaConfigControls.jsx 文案白名单与 DOM 结构契约', () => {
    const jsxPath = path.join(__dirname, 'MediaConfigControls.jsx');
    const jsxContent = fs.readFileSync(jsxPath, 'utf8');

    // 严禁存在英文括号废话
    assert.doesNotMatch(jsxContent, /图像生成\s*\(Image\)/, '不得包含英文括号废话 (Image)');
    assert.doesNotMatch(jsxContent, /视频生成\s*\(Video\)/, '不得包含英文括号废话 (Video)');

    // 模式切换菜单项严格为中文白名单
    assert.match(jsxContent, /<span>图像生成<\/span>/);
    assert.match(jsxContent, /<span>视频生成<\/span>/);

    // 视频参数标题规范
    assert.match(jsxContent, /<div className="omx-param-title">生成方式<\/div>/, '视频参数标题必须为生成方式');
    assert.match(jsxContent, /<div className="omx-param-title">声音<\/div>/, '视频声音标题必须为声音');
    assert.doesNotMatch(jsxContent, /<div className="omx-param-title">生成模式<\/div>/, '不得使用旧词生成模式');
    assert.doesNotMatch(jsxContent, /<div className="omx-param-title">有声<\/div>/, '不得使用旧词有声作为分组标题');

    // 比例线框外层 20px 居中盒
    assert.match(jsxContent, /className="omx-ratio-wire-box"/, '比例线框外层必须包裹 omx-ratio-wire-box');

    // 图像张数标题规范与紧凑无空格书写
    assert.match(jsxContent, /<div className="omx-param-title">张数<\/div>/, '图像参数标题必须为张数');
    assert.doesNotMatch(jsxContent, /<div className="omx-param-title">生成张数<\/div>/, '不得使用旧词生成张数');
    assert.match(jsxContent, /\{cnt\}张/, '张数选项文字必须紧凑无空格（{cnt}张）');
    assert.doesNotMatch(jsxContent, /\{cnt\}\s+张/, '张数选项文字严禁带空格（{cnt} 张）');
  });

  it('Step 6: 图像参数子列弹性伸缩与药丸防折行规范', () => {
    // 子列等分且允许压缩
    assert.match(MEDIA_VIEWER_CSS, /\.omx-param-subcol\s*\{[^}]*flex:\s*1;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-param-subcol\s*\{[^}]*min-width:\s*0;/);

    // 药丸严格防折行
    assert.match(MEDIA_VIEWER_CSS, /\.omx-mode-pill\s*\{[^}]*white-space:\s*nowrap;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-mode-pill\s*\{[^}]*word-break:\s*keep-all;/);
    assert.match(MEDIA_VIEWER_CSS, /\.omx-mode-pill\s*\{[^}]*min-width:\s*0;/);
  });
});
