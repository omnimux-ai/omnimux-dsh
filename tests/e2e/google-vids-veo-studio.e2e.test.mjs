/**
 * tests/e2e/google-vids-veo-studio.e2e.test.mjs
 *
 * Google Vids (Veo) 视频生成中枢与剪辑协同端到端质量验收（Issue #2655）
 * 验收目标：
 *  1. 开箱环境就绪向导（Onboarding Wizard）四步体检与一键自愈交互契约（AC-1）
 *  2. 剪辑项目准入状态硬门禁与平滑解锁契约（AC-2）
 *  3. 后台无头静默生成、进度百分比流动与直链安全捕获（AC-3）
 *  4. 视频安全落盘于工作区内部，杜绝 /tmp/ 沙箱跨区拦截（AC-4）
 *  5. 视频成片 1 秒无缝 0 间距自动追加至右侧时间轴主轨（AC-5）
 *  6. 延续扩展、编辑修改跨组件状态穿透（AC-6）
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkProjectEditorReady, createAppendClipOperation } from '../../plugins/omnimux-clip/src/timeline/appendAdapter.js';
import { validateVeoTaskRequest, GOOGLE_VIDS_PROTO_TEMPLATES } from '../../plugins/omnimux-video/src/contracts/veoContracts.js';
import { detectOpenCliEnvironment } from '../../plugins/omnimux-video/src/driver/veoHeadlessDriver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');

test('E2E: Google Vids Veo 生成中枢与剪辑协同全链路质量验收', async (t) => {

  await t.test('E2E-AC-1: 开箱环境就绪向导（Onboarding Wizard）规格核验', () => {
    const demoHtmlPath = path.join(root, '.workbuddy/demo/google-vids-clip-demo.html');
    assert.ok(fs.existsSync(demoHtmlPath), 'Demo HTML 必须存在');

    const html = fs.readFileSync(demoHtmlPath, 'utf8');
    assert.match(html, /onboarding-overlay/, '必须包含向导遮罩容器');
    assert.match(html, /1\. OpenCLI 驱动引擎环境/, '必须包含第1步驱动检测');
    assert.match(html, /2\. 浏览器安全桥接 \(Chrome 扩展\)/, '必须包含第2步扩展桥接检测');
    assert.match(html, /3\. 谷歌账号与 Vids 授权/, '必须包含第3步谷歌会话检测');
    assert.match(html, /4\. 剪辑工作台多轨时间轴/, '必须包含第4步剪辑就绪检测');
    assert.match(html, /finishOnboardingAndEnter/, '必须具备全绿后平滑解锁进入工作台函数');

    // 探测本机环境驱动状态
    const env = detectOpenCliEnvironment();
    assert.equal(env.installed, true, '开发机必须正确检测到全局 OpenCLI');
  });

  await t.test('E2E-AC-2: 剪辑项目准入状态硬门禁与平滑解锁', () => {
    // 1. 未进入项目态检测
    const gateCheckBefore = checkProjectEditorReady(null);
    assert.equal(gateCheckBefore.isReady, false);
    assert.match(gateCheckBefore.reason, /请先新建或打开项目/);

    // 2. 进入项目后检测
    const gateCheckAfter = checkProjectEditorReady({
      id: 'proj_skincare_demo',
      schema: {
        tracks: [
          { id: 'track_video_main', type: 'video', isLocked: false, clips: [] }
        ]
      }
    });
    assert.equal(gateCheckAfter.isReady, true);
  });

  await t.test('E2E-AC-3: 任务生成参数校验与谷歌底层 374/376 模板完整性', () => {
    const validReq = validateVeoTaskRequest({
      prompt: 'A futuristic city with flying cars at sunset, 4k cinematic',
      mode: 'create',
      parameters: { durationSec: 10, resolution: '720p', aspectRatio: '16:9', model: 'veo-omni-v1' }
    });
    assert.equal(validReq.valid, true);

    const t374 = GOOGLE_VIDS_PROTO_TEMPLATES.TEXT_TO_VIDEO('doc_e2e_1', 'prompt_text', 10);
    assert.equal(t374[0], 374);

    const t376 = GOOGLE_VIDS_PROTO_TEMPLATES.IMAGE_TO_VIDEO('doc_e2e_2', 'prompt_text', 'AVL_123', 'UUID_456', 10);
    assert.equal(t376[0], 376);
  });

  await t.test('E2E-AC-4: 工作区安全沙箱媒体防穿透校验', () => {
    const demoHtmlPath = path.join(root, '.workbuddy/demo/google-vids-clip-demo.html');
    const html = fs.readFileSync(demoHtmlPath, 'utf8');

    // 严禁存在 /tmp/ 导致引发 path outside workspace 拦截
    assert.doesNotMatch(html, /\/tmp\/google_vids/, '严禁引用跨工作区绝对路径');
    assert.match(html, /\.\/media\/google_vids_/, '必须统一使用工作区内部相对路径');
  });

  await t.test('E2E-AC-5 & AC-6: 成片自动追加主轨与跨组件动作栏联动', () => {
    const videoFile = path.join(root, '.workbuddy/demo/media/google_vids_korean_skincare.mp4');
    assert.ok(fs.existsSync(videoFile), '工作区测试视频必须落盘就绪');

    const schema = {
      tracks: [
        {
          id: 'track_video_main',
          type: 'video',
          isLocked: false,
          clips: [{ id: 'clip_intro', startTimeMs: 0, durationMs: 10000 }]
        }
      ]
    };

    const appendRes = createAppendClipOperation({
      currentSchema: schema,
      videoFilePath: videoFile,
      title: '韩国极简防晒美学成片',
      durationSec: 10
    });

    assert.equal(appendRes.success, true);
    assert.equal(appendRes.trackId, 'track_video_main');
    assert.equal(appendRes.startTimeMs, 10000, '必须严格 0 间距拼接在前序 10s 之后');
    assert.equal(appendRes.newTotalDurationMs, 20000);
    assert.equal(appendRes.playheadSeekMs, 10000, '播放头必须对齐新切片起点');

    // 检查组件源文件中对动作栏事件的绑定
    const componentPath = path.join(root, 'plugins/omnimux-video/src/client/GoogleVidsStudioPanel.jsx');
    const compSrc = fs.readFileSync(componentPath, 'utf8');
    assert.match(compSrc, /onInsertToTimeline/, '必须包含插入轨道回调');
    assert.match(compSrc, /handleSwitchMode\('extend'/, '必须包含延续扩展联动');
    assert.match(compSrc, /handleSwitchMode\('modify'/, '必须包含编辑修改联动');
    assert.match(compSrc, /handleUpscale/, '必须包含升频超分状态流转');
    assert.match(compSrc, /handleRemoveTask/, '必须包含移除卡片逻辑');
  });

});
