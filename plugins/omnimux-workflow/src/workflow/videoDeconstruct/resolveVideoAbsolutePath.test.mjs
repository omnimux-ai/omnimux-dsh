/**
 * 项目文件流 URL 的视频路径解析（Issue #1827）。
 *
 * 已绑定项目画布的视频节点只有 `relativePath` + `mediaUrl`
 * （`/omnimux-workflow/api/workspaces/<ws>/file?rel=<encoded rel>`，无 `realPath`）。
 * 前端把它原样作为 `videoPath` 提交；解析器不识别 `?rel=` 时，剥掉 query 得到的
 * `/omnimux-workflow/api/workspaces/<ws>/file` 以 `/` 开头会被误判为绝对路径，
 * 存在性校验随即失败 → 「提取音频」404 video-not-found。
 *
 * 边界语义由 projects/paths.ts 的真实实现提供，测试替身不自行发明校验规则。
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { buildSync } from 'esbuild';

const buildDir = mkdtempSync(join(tmpdir(), 'resolve-video-path-build-'));
const bundle = join(buildDir, 'runtime.mjs');
buildSync({
  stdin: {
    contents: `
      export { resolveVideoAbsolutePath } from './service.ts';
      export { resolveProjectRelPath, assertProjectWriteSafe } from '../../projects/paths.ts';
    `,
    resolveDir: fileURLToPath(new URL('.', import.meta.url)),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundle,
});
const { resolveVideoAbsolutePath, resolveProjectRelPath, assertProjectWriteSafe } =
  await import(pathToFileURL(bundle).href);
after(() => rmSync(buildDir, { recursive: true, force: true }));

const WORKSPACE_ID = 'ws_test';

/** 临时项目根 + artifacts 视频 + 生产同款解析语义（含边界校验）。 */
function harness(t) {
  const root = mkdtempSync(join(tmpdir(), 'resolve-video-path-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  // 项目根故意带中文与空格，贴近真实绑定项目。
  const projectRoot = join(root, '项目 测试');
  const artifacts = join(projectRoot, 'artifacts');
  mkdirSync(artifacts, { recursive: true });
  const video = join(artifacts, 'clip.mp4');
  writeFileSync(video, 'FAKE_VIDEO');
  const spacedDir = join(projectRoot, '素材 目录');
  mkdirSync(spacedDir, { recursive: true });
  const spacedVideo = join(spacedDir, 'a b.mp4');
  writeFileSync(spacedVideo, 'FAKE_VIDEO_2');

  // 项目外文件：用于证明越界 rel 不会被解析出去。
  const outside = join(root, 'outside.mp4');
  writeFileSync(outside, 'OUTSIDE');

  const mediaDir = join(root, 'media');
  mkdirSync(join(mediaDir, 'videos'), { recursive: true });
  const mediaVideo = join(mediaDir, 'videos', 'legacy.mp4');
  writeFileSync(mediaVideo, 'LEGACY');

  const workspacesDir = join(root, 'workspaces');
  mkdirSync(workspacesDir, { recursive: true });

  const deps = {
    store: {
      workspacesDir,
      get: () => ({ id: WORKSPACE_ID }),
      resolveProjectRoot: () => ({ path: projectRoot }),
    },
    mediaDir,
    resolveProjectFile: (_workspaceId, rel) => {
      const abs = resolveProjectRelPath(projectRoot, rel);
      assertProjectWriteSafe(abs, projectRoot);
      if (!existsSync(abs)) throw new Error('not-found');
      return abs;
    },
  };

  return { root, projectRoot, video, spacedVideo, outside, mediaVideo, deps };
}

const fileUrl = (workspaceId, rel) =>
  `/omnimux-workflow/api/workspaces/${workspaceId}/file?rel=${encodeURIComponent(rel)}`;

test('U1: ?rel= 项目文件流 URL 解析为项目内真实绝对路径', (t) => {
  const { deps, video } = harness(t);
  const url = fileUrl(WORKSPACE_ID, 'artifacts/clip.mp4');
  assert.equal(resolveVideoAbsolutePath(deps, WORKSPACE_ID, url), video);
});

test('U2: rel 含中文与空格时仍正确还原', (t) => {
  const { deps, spacedVideo } = harness(t);
  const url = fileUrl(WORKSPACE_ID, '素材 目录/a b.mp4');
  assert.equal(resolveVideoAbsolutePath(deps, WORKSPACE_ID, url), spacedVideo);
});

test('U3: ../ 越界 rel 不得解析到项目根之外', (t) => {
  const { deps, outside } = harness(t);
  const url = fileUrl(WORKSPACE_ID, '../outside.mp4');
  assert.notEqual(resolveVideoAbsolutePath(deps, WORKSPACE_ID, url), outside);
});

test('U3b: 未注入 resolveProjectFile 时，兜底分支同样挡住越界 rel', (t) => {
  const { deps, outside } = harness(t);
  const fallbackDeps = { ...deps, resolveProjectFile: undefined };
  const url = fileUrl(WORKSPACE_ID, '../outside.mp4');
  assert.notEqual(resolveVideoAbsolutePath(fallbackDeps, WORKSPACE_ID, url), outside);
});

test('U4: 不存在的 rel 不抛异常且不返回项目外路径', (t) => {
  const { deps, projectRoot } = harness(t);
  const url = fileUrl(WORKSPACE_ID, 'artifacts/missing.mp4');
  const resolved = resolveVideoAbsolutePath(deps, WORKSPACE_ID, url);
  assert.equal(typeof resolved, 'string');
  assert.ok(!resolved.startsWith(join(projectRoot, 'artifacts')));
});

test('U5: /api/project-file 别名形式同样可解析', (t) => {
  const { deps, video } = harness(t);
  const url = `/omnimux-workflow/api/project-file?workspace=${WORKSPACE_ID}&rel=${encodeURIComponent('artifacts/clip.mp4')}`;
  assert.equal(resolveVideoAbsolutePath(deps, WORKSPACE_ID, url), video);
});

test('U6a: 既有形式回归 —— 本机绝对路径直通', (t) => {
  const { deps, video } = harness(t);
  assert.equal(resolveVideoAbsolutePath(deps, WORKSPACE_ID, video), video);
});

test('U6b: 既有形式回归 —— /api/local-file?path= 还原', (t) => {
  const { deps, video } = harness(t);
  const url = `/omnimux-workflow/api/local-file?path=${encodeURIComponent(video)}`;
  assert.equal(resolveVideoAbsolutePath(deps, WORKSPACE_ID, url), video);
});

test('U6c: 既有形式回归 —— media 前缀落到 mediaDir', (t) => {
  const { deps, mediaVideo } = harness(t);
  const url = '/omnimux-workflow/media/videos/legacy.mp4';
  assert.equal(resolveVideoAbsolutePath(deps, WORKSPACE_ID, url), mediaVideo);
});

test('U6d: 既有形式回归 —— 远程 HTTP(S) 直通', (t) => {
  const { deps } = harness(t);
  const url = 'https://example.com/video.mp4';
  assert.equal(resolveVideoAbsolutePath(deps, WORKSPACE_ID, url), url);
});
