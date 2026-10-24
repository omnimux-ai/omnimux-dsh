#!/usr/bin/env node
/**
 * #3289 3D director acceptance runner (plain node, no node:test).
 *
 * The previous node:test harnesses were API-stale against main's task-private
 * bootstrap (`assembly`/`taskPackages`/`installedIdentities` no longer exist)
 * and were replaced by this runner. It starts the fresh task-private contract:
 *   startTestEnvironment({ root, mode: 'ui',
 *     evidenceContext: { taskId: '3289', runId: 'accept-<unique>' },
 *     candidate: { base: <origin/main sha>, head: <HEAD sha> },
 *     taskPlugins: ['omnimux-workflow', 'omnimux-automation'] })
 *
 * The bootstrap builds, packs and installs those plugins from the candidate
 * source into a task-private app, then proves the installed/loaded identity.
 * Nothing Dev-backed is used and no workaround is attempted: an exact
 * TEST_ENV_* code is recorded instead. `candidate.outputs` is deliberately
 * omitted because the evidence contract only allows summary/evidence paths as
 * outputs (build artifacts are produced in the private stage).
 *
 * Usage:
 *   DIRECTOR_EGO_BROWSER=/Users/x/.local/bin/ego-browser \
 *   DIRECTOR_FFMPEG=/Users/x/.local/bin/ffmpeg \
 *   node scripts/director-acceptance-3289.mjs
 *
 * Evidence: `<root>/.agent-reports/beeftv-director/acceptance-3289-<random>/`.
 * Exit code 0 only when a completed run has read-back passing evidence.
 */
import * as fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 「添加节点」菜单里导演台条目的文案。#3640 把菜单文案从「3D 导演台 / 3D Director」改成
 * 「导演台 / Director」，而节点类型名仍是「3D 导演台 / 3D Director」——两者是两个事实。
 * 菜单文案只此一处声明，改名时改这里即可，避免 runner 与产品事实再次脱节。 */
export const DIRECTOR_PALETTE_LABELS = ['导演台', 'Director', '3D 导演台', '3D Director'];
const reportRoot = join(root, '.agent-reports/beeftv-director');
const expected = ['normal-project-entry', 'portrait-selected', 'managed-media-decoded', 'saved-scene', 'play-seek', 'decoded-motion', 'scene-reopened', 'aspect-reopened'];
const browserEnv = () => ({ HOME: process.env.HOME, PATH: process.env.PATH });
const save = (directory, name, value) => fs.writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + '\n');
const read = (directory, name) => JSON.parse(fs.readFileSync(join(directory, name), 'utf8'));
const stamp = () => new Date().toISOString();
const log = message => process.stdout.write(`[director-acceptance] ${stamp()} ${message}\n`);

/**
 * Serialized declaration. Ego only receives the in-memory login capability,
 * never a token in evidence. Keep it fully self-contained.
 */
async function browserJourney({ loginUrl, evidence, origin, projectTitle, paletteLabels }) {
  const fs = await import('node:fs/promises');
  const assert = (await import('node:assert/strict')).default;
  const redact = value => String(value).replaceAll(loginUrl, '[redacted-login-url]').replace(/([?&]token=)[^&\s"'<>]+/gi, '$1REDACTED');
  const write = (name, value) => fs.writeFile(`${evidence}/${name}`, redact(JSON.stringify(value, null, 2)));
  const results = [];
  const record = (name, detail) => results.push({ name, passed: true, detail });
  let task, page, phase = 'space', failure;
  const visible = (selector, timeout = 30000) => page.waitForSelector(selector, { state: 'visible', timeout });
  const hidden = (selector, timeout = 20000) => page.waitForSelector(selector, { state: 'hidden', timeout });
  const publicScene = async path => {
    const response = await page.fetch(path, { timeout: 10000 });
    assert.equal(response.status, 200, 'public scene GET must succeed');
    const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
    assert.ok(body.document?.scene, 'public scene document required');
    return body.document;
  };
  let step = 'init';
  const act = async (name, fn) => { step = name; return fn(); };
  /** Count elements matching a selector that can receive pointer input (visible, not disabled/inert). */
  const visibleCount = selector => page.evaluate(candidate => [...document.querySelectorAll(candidate)].filter(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && style.pointerEvents !== 'none' && !element.disabled && !element.closest('[inert]');
  }).length, selector);
  /** Click the first candidate selector that resolves to exactly one visible element; never guesses. */
  const clickFirstActionable = async (selectors, timeout = 30000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const selector of selectors) {
        let count = 0;
        try { count = await visibleCount(selector); } catch { count = 0; }
        if (count !== 1) continue;
        try { await page.click(selector, { timeout: 3000 }); return selector; } catch { /* try the next reviewed candidate */ }
      }
      await page.waitForTimeout(200);
    }
    return null;
  };
  /** Wait for one of the exact button labels to be visible, then click it. Returns the label. */
  const clickFirstLabel = async (labels, timeout = 30000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const label of labels) {
        const count = await page.evaluate(text => [...document.querySelectorAll('button,[role="button"],[role="menuitem"]')].filter(element => {
          if ((element.textContent || '').trim() !== text) return false;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !element.disabled && !element.closest('[inert]');
        }).length, label);
        if (count === 1) {
          try { await page.click(`text="${label}"`, { timeout: 3000 }); return label; } catch { /* try the next reviewed label */ }
        }
      }
      await page.waitForTimeout(200);
    }
    return null;
  };
  /** Wait until any reviewed exact label is visible (does not click). Returns the label. */
  const waitForAnyLabel = async (labels, timeout = 30000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const label of labels) {
        const visibleNow = await page.evaluate(text => [...document.querySelectorAll('button,[role="button"],[role="menuitem"],[role="note"]')].some(element => {
          if ((element.textContent || '').trim() !== text) return false;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        }), label);
        if (visibleNow) return label;
      }
      await page.waitForTimeout(200);
    }
    return null;
  };
  /**
   * Focus one scoped button and activate it with the keyboard. Works for portal menus and
   * controls that a scrolled inspector leaves outside the viewport, without DOM .click().
   */
  const keyboardActivate = async (scope, matcher) => {
    const focused = await page.evaluate(({ scope, matcher }) => {
      const root = document.querySelector(scope);
      if (!root) return false;
      const button = [...root.querySelectorAll('button')].find(item => !item.disabled && (
        matcher.kind === 'aria' ? item.getAttribute('aria-label') === matcher.value : (item.textContent || '').trim() === matcher.value
      ));
      if (!button) return false;
      button.scrollIntoView({ block: 'center' });
      button.focus();
      return true;
    }, { scope, matcher });
    if (focused) await page.keyboard.press('Enter');
    return focused;
  };
  /** Click through the normal pointer path, falling back to focused Enter for off-viewport controls. */
  const clickOrActivate = async (selector, scope, matcher) => {
    try {
      await page.click(selector, { timeout: 3000 });
      return 'click';
    } catch {
      if (await keyboardActivate(scope, matcher)) return 'keyboard';
      throw new Error(`control not actionable: ${selector}`);
    }
  };
  /** Visible DOM inventory for an unresolved selector: never guess, retain facts. */
  async function diagnose(error) {
    const summary = { phase, step, error: { name: error?.name, code: error?.code, message: redact(error?.message || error).slice(0, 2000) } };
    if (!page) return summary;
    try { await page.screenshot({ path: `${evidence}/failure.png` }); summary.screenshot = 'failure.png'; } catch (screenshotError) { summary.screenshotError = String(screenshotError?.message || screenshotError); }
    try {
      summary.dom = await page.evaluate(() => {
        const visible = element => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'; };
        const label = element => ({ tag: element.tagName, ariaLabel: element.getAttribute('aria-label') || '', role: element.getAttribute('role') || '', text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) });
        const collect = selector => [...document.querySelectorAll(selector)].filter(visible).map(label).slice(0, 150);
        return {
          url: location.origin + location.pathname,
          title: document.title,
          directorRoot: Boolean(document.querySelector('.wf-director-root')),
          rendererReady: document.querySelector('.director-viewport-shell')?.getAttribute('data-renderer-ready') ?? null,
          propertyInspector: Boolean(document.querySelector('[data-director-property-inspector]')),
          details: [...document.querySelectorAll('[data-director-property-inspector] details')].map(item => ({ open: item.open, summary: (item.querySelector('summary')?.textContent || '').trim() })),
          buttons: collect('button'),
          summaries: collect('summary'),
          menuItems: collect('.director-menu [role="menuitem"], .director-menu button'),
        };
      });
    } catch (domError) { summary.domError = String(domError?.message || domError); }
    try { await write('failure.json', summary); } catch { /* evidence write must not mask the journey error */ }
    return summary;
  }
  try {
    task = await taskSpace(`3289 director acceptance ${Date.now()}`);
    await write('space.json', { spaceId: task.spaceId, spaceName: task.name ?? null });
    page = task.page('p1');
    step = 'open-project'; phase = 'normal-project-entry';
    await page.goto(loginUrl);
    await visible('button[aria-label="Projects"]');
    // A fresh task-private profile opens the first-run "Internal Testing Notice" modal; while it
    // is open the shell is inert and sidebar clicks cannot receive input. Acknowledge it first.
    const notice = 'button:text-is("Continue")';
    const firstRunNoticeDismissed = await page.waitForSelector(notice, { state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    if (firstRunNoticeDismissed) {
      await page.click(notice);
      await page.waitForSelector(notice, { state: 'hidden', timeout: 15000 });
    }
    const projectsControl = await clickFirstActionable(['button[aria-label="Projects"]', 'button[aria-label="项目"]'], 15000);
    if (!projectsControl) throw new Error('Projects sidebar entry not actionable');
    // The project library is localized; accept both reviewed labels and require one visible button.
    const newProjectLabel = await clickFirstLabel(['New Project', '新建项目'], 30000);
    if (!newProjectLabel) throw new Error('project library "New Project" action not found');
    const namePlaceholder = await page.evaluate(() => {
      const candidates = ['Project name', '项目名称'];
      return [...document.querySelectorAll('input')].map(input => input.getAttribute('placeholder')).find(value => candidates.includes(value)) ?? null;
    });
    if (!namePlaceholder) throw new Error('project name input placeholder not found');
    await page.fill(`input[placeholder="${namePlaceholder}"]`, projectTitle);
    await page.click('loc=css:.omnimux-workflow-dialog-footer button >> nth=1');
    await visible('.wf-canvas-toolbar');
    // In the workbench-tab layout the shell-level Fullscreen button stays hidden; the visible
    // control is the official right-panel mode button. Try the reviewed candidates in order.
    const fullscreenControl = await clickFirstActionable([
      'button[data-sidebar-right-mode="fullscreen"]',
      'button[aria-label="Fullscreen"]',
      'button[aria-label="全屏"]',
      'button[aria-label="To fullscreen"]',
    ], 15000);
    if (fullscreenControl) {
      await page.waitForFunction(() => Boolean(
        document.querySelector('[data-sidebar-right-panel="fullscreen"][data-sidebar-right-open]')
        || document.querySelector('[data-rightbar-fullscreen="true"]'),
      ), undefined, { timeout: 8000 }).catch(() => {});
    }
    await visible('.wf-canvas-toolbar');
    await page.click('loc=css:.wf-canvas-toolbar button.wf-canvas-toolbar__item--primary-add');
    const menuLabel = await waitForAnyLabel(paletteLabels, 30000);
    if (!menuLabel) throw new Error(`3D director palette entry did not appear (expected: ${paletteLabels.join(' / ')})`);
    const nodeLabel = await clickFirstLabel([menuLabel], 10000);
    if (!nodeLabel) throw new Error('3D director palette entry not actionable');
    await visible('text="打开导演台"'); await page.click('text="打开导演台"');
    await visible('.wf-director-root');
    await visible('.director-viewport-shell[data-renderer-ready="true"]', 45000);
    record(phase, { normalUI: true, rendererReady: true, firstRunNoticeDismissed, newProjectLabel, namePlaceholder, fullscreenControl, nodeLabel });

    step = 'add-actor-standard-female'; phase = 'portrait-selected';
    const director = 'loc=css:.wf-director-root ';
    await clickOrActivate(director + 'button[aria-label="添加角色"]', '.wf-director-root', { kind: 'aria', value: '添加角色' });
    await visible(director + 'button[aria-label="标准女性"]'); await clickOrActivate(director + 'button[aria-label="标准女性"]', '.wf-director-root', { kind: 'aria', value: '标准女性' });
    const skipOnboarding = await clickFirstLabel(['跳过引导'], 15000);
    if (skipOnboarding) await hidden('text="跳过引导"');
    step = 'select-portrait-aspect';
    await clickOrActivate(director + 'button[aria-label="选择画幅比例"]', '.wf-director-root', { kind: 'aria', value: '选择画幅比例' });
    await visible(director + 'button[aria-label="9:16"]'); await clickOrActivate(director + 'button[aria-label="9:16"]', '.wf-director-root', { kind: 'aria', value: '9:16' });
    assert.equal(await page.evaluate(() => document.querySelector('.wf-director-root button[aria-label="9:16"]')?.getAttribute('aria-pressed')), 'true');
    record(phase, { aspectRatio: '9:16', skipOnboarding });

    // Camera inspector: the camera-properties panel lives in the right inspector and the
    // shot controls are collapsed inside a <details> summary; open it before selecting 运镜.
    step = 'open-camera-view';
    await page.keyboard.press('Escape');
    await page.waitForSelector('.director-menu', { state: 'hidden', timeout: 5000 }).catch(() => {});
    await act('click-camera-view', async () => {
      await clickOrActivate(
        'loc=css:.wf-director-root [role="group"][aria-label="导演台取景模式"] button[aria-label="机位视角"]',
        '.wf-director-root [role="group"][aria-label="导演台取景模式"]',
        { kind: 'aria', value: '机位视角' },
      );
    });
    await act('wait-property-inspector', async () => {
      await visible('[data-director-property-inspector]', 20000);
      await page.waitForFunction(() => document.querySelector('[data-director-property-inspector]')?.scrollHeight > 0, undefined, { timeout: 10000 });
    });
    await act('open-advanced-camera-details', async () => {
      await page.evaluate(() => {
        const host = document.querySelector('[data-director-property-inspector]');
        const details = [...host.querySelectorAll('details')].find(item => (item.querySelector('summary')?.textContent || '').includes('镜头高级参数'));
        if (!details) return false;
        details.scrollIntoView({ block: 'center' });
        return true;
      }).then(found => { if (!found) throw new Error('镜头高级参数 details not found in property inspector'); });
      const open = await page.evaluate(() => {
        const host = document.querySelector('[data-director-property-inspector]');
        const details = [...host.querySelectorAll('details')].find(item => (item.querySelector('summary')?.textContent || '').includes('镜头高级参数'));
        return Boolean(details?.open);
      });
      if (!open) {
        try { await page.click('loc=css:[data-director-property-inspector] summary:text-is("镜头高级参数")'); }
        catch {
          await page.evaluate(() => {
            const host = document.querySelector('[data-director-property-inspector]');
            const details = [...host.querySelectorAll('details')].find(item => (item.querySelector('summary')?.textContent || '').includes('镜头高级参数'));
            if (details) details.open = true;
          });
        }
      }
      await page.waitForFunction(() => {
        const host = document.querySelector('[data-director-property-inspector]');
        const details = [...host.querySelectorAll('details')].find(item => (item.querySelector('summary')?.textContent || '').includes('镜头高级参数'));
        return Boolean(details?.open);
      }, undefined, { timeout: 10000 });
      await page.evaluate(() => {
        const host = document.querySelector('[data-director-property-inspector]');
        const details = [...host.querySelectorAll('details')].find(item => (item.querySelector('summary')?.textContent || '').includes('镜头高级参数'));
        details?.scrollIntoView({ block: 'center' });
      });
    });
    await page.screenshot({ path: `${evidence}/camera-properties.png` });
    step = 'select-camera-move';
    await act('click-camera-move-select', async () => {
      await visible('loc=css:[data-director-property-inspector] button.director-select:text-is("固定")', 15000);
      await clickOrActivate(
        'loc=css:[data-director-property-inspector] button.director-select:text-is("固定")',
        '[data-director-property-inspector]',
        { kind: 'text', value: '固定' },
      );
    });
    await act('choose-push-in', async () => {
      await visible('.director-menu', 10000);
      // The menu is portaled and can be positioned outside the viewport in the task-private
      // workbench tab layout; focusing the item and pressing Enter is viewport-independent.
      const activated = await keyboardActivate('.director-menu', { kind: 'text', value: '推进' });
      if (!activated) throw new Error('camera move option 推进 not found');
      await page.waitForFunction(() => [...document.querySelectorAll('[data-director-property-inspector] button.director-select')].some(item => (item.textContent || '').trim() === '推进'), undefined, { timeout: 15000 });
      await page.waitForSelector('.director-menu', { state: 'hidden', timeout: 10000 }).catch(() => {});
    });
    await act('generate-motion-trajectory', async () => {
      await visible('loc=css:[data-director-property-inspector] button:text-is("按运镜生成轨迹")', 15000);
      await clickOrActivate(
        'loc=css:[data-director-property-inspector] button:text-is("按运镜生成轨迹")',
        '[data-director-property-inspector]',
        { kind: 'text', value: '按运镜生成轨迹' },
      );
    });
    await act('wait-saved-after-trajectory', async () => {
      await page.waitForFunction(() => document.querySelector('[aria-label="导演台保存状态"]')?.textContent?.trim() === '已保存', undefined, { timeout: 30000 });
    });
    await act('export-clay-video', async () => {
      // The dock menu also renders a "导出白膜视频" menu item; scope the unique workbench
      // button to the property inspector so the label is unambiguous.
      await visible('loc=css:[data-director-property-inspector] button:text-is("导出白膜视频")', 15000);
      await clickOrActivate(
        'loc=css:[data-director-property-inspector] button:text-is("导出白膜视频")',
        '[data-director-property-inspector]',
        { kind: 'text', value: '导出白膜视频' },
      );
    });
    step = 'await-managed-media'; phase = 'managed-media-decoded';
    await page.waitForFunction(() => {
      const video = document.querySelector('.wf-canvas-editor video');
      return video && Number.isFinite(video.duration) && video.duration > 0 && video.videoWidth > 0;
    }, undefined, { timeout: 120000 });
    const media = await page.evaluate(() => {
      const video = document.querySelector('.wf-canvas-editor video');
      const image = [...document.querySelectorAll('.wf-canvas-editor img')].find(item => item.src.includes('/file?'));
      return { src: video.currentSrc || video.src, duration: video.duration, width: video.videoWidth, height: video.videoHeight, image: image?.currentSrc || image?.src, error: video.error?.code ?? null };
    });
    assert.equal(media.error, null); assert.ok(Math.abs(media.duration - 5) <= 0.3, 'five-second recording tolerance');
    assert.ok(Math.abs(media.width / media.height / (9 / 16) - 1) <= 0.01, 'portrait video ratio');
    assert.ok(media.image, 'composition image required');
    const videoUrl = new URL(media.src), imageUrl = new URL(media.image);
    assert.equal(videoUrl.origin, origin); assert.equal(imageUrl.origin, origin);
    const match = /^artifacts\/director\/([^/]+)\/([^/]+)\/[^/]+\.webm$/.exec(videoUrl.searchParams.get('rel') || '');
    assert.ok(match, 'managed actual WebM output required');
    const scenePath = `/omnimux-workflow/api/workspaces/${encodeURIComponent(match[1])}/director/${encodeURIComponent(match[2])}`;
    assert.equal(videoUrl.pathname, `/omnimux-workflow/api/workspaces/${encodeURIComponent(match[1])}/file`);
    assert.equal(imageUrl.pathname, videoUrl.pathname);
    assert.ok((imageUrl.searchParams.get('rel') || '').startsWith(`artifacts/director/${match[1]}/${match[2]}/`));
    const imageDecoded = await page.evaluate(async src => {
      const image = new Image(); image.src = src;
      await Promise.race([image.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error('image decode budget')), 10000))]);
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, media.image);
    assert.ok(imageDecoded.width > 1 && imageDecoded.height > 1, 'real composition, not synthetic pixel');
    assert.ok(Math.abs(imageDecoded.width / imageDecoded.height / (9 / 16) - 1) <= 0.01);
    for (const [url, name] of [[media.src, 'reference.webm'], [media.image, 'composition.png']]) {
      const response = await page.fetch(url, { saveAs: `${evidence}/${name}`, timeout: 30000 });
      assert.equal(response.status, 200, 'managed media byte fetch');
    }
    await write('media.json', { ...media, imageDecoded, scenePath }); record(phase, { ...media, imageDecoded });

    step = 'close-and-verify-saved-scene'; phase = 'saved-scene';
    await clickOrActivate(director + 'button[aria-label="关闭导演台"]', '.wf-director-root', { kind: 'aria', value: '关闭导演台' });
    await page.waitForSelector('.wf-director-root', { state: 'hidden', timeout: 30000 });
    const saved = await publicScene(scenePath);
    assert.ok(saved.revision > 0); assert.equal(saved.scene.aspectRatio, '9:16');
    assert.equal(saved.scene.objects.filter(item => item.actorPreset === 'standard_female').length, 1);
    const shot = saved.scene.shots.find(item => item.id === saved.scene.activeShotId);
    assert.equal(shot.duration, 5); assert.equal(shot.fps, 30); assert.equal(shot.cameraMove, 'push_in');
    const camera = saved.scene.cameras.find(item => item.id === shot.cameraId);
    assert.ok(camera?.keyframes?.length >= 2 || camera?.motionPath, 'saved camera trajectory required');
    await write('saved-scene.json', saved); record(phase, { revision: saved.revision, sceneId: saved.scene.id });

    step = 'play-and-seek'; phase = 'play-seek';
    await page.evaluate(async () => { const video = document.querySelector('.wf-canvas-editor video'); video.muted = true; await video.play(); });
    await page.waitForFunction(() => document.querySelector('.wf-canvas-editor video')?.currentTime > 0.5, undefined, { timeout: 10000 });
    await page.evaluate(() => { const video = document.querySelector('.wf-canvas-editor video'); video.pause(); video.currentTime = 2.5; });
    await page.waitForFunction(() => { const video = document.querySelector('.wf-canvas-editor video'); return video && !video.seeking && Math.abs(video.currentTime - 2.5) < 0.1 && video.readyState >= 2; }, undefined, { timeout: 10000 });
    const playback = await page.evaluate(() => { const video = document.querySelector('.wf-canvas-editor video'); return { currentTime: video.currentTime, duration: video.duration, readyState: video.readyState, error: video.error?.code ?? null }; });
    assert.equal(playback.error, null); assert.ok(playback.readyState >= 2); assert.ok(Math.abs(playback.currentTime - 2.5) < 0.1);
    await page.screenshot({ path: `${evidence}/playback.png` }); record(phase, playback);
    step = 'decode-motion-frames'; phase = 'decoded-motion';
    const frames = [];
    for (const time of [0.1, 2.5, 4.7]) {
      await page.evaluate(time => { document.querySelector('.wf-canvas-editor video').currentTime = time; }, time);
      await page.waitForFunction(time => { const video = document.querySelector('.wf-canvas-editor video'); return video && !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - time) < 0.1; }, time, { timeout: 10000 });
      frames.push(await page.evaluate(async () => {
        const video = document.querySelector('.wf-canvas-editor video'), canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const context = canvas.getContext('2d'); context.drawImage(video, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const digest = await crypto.subtle.digest('SHA-256', pixels);
        return { time: video.currentTime, sha256: [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('') };
      }));
    }
    assert.equal(new Set(frames.map(frame => frame.sha256)).size, 3, 'decoded first/middle/end must show motion');
    await write('decoded-frames.json', frames); record(phase, frames);

    step = 'reopen-director'; phase = 'scene-reopened';
    await page.click('text="打开导演台"'); await visible('.wf-director-root');
    await visible('.director-viewport-shell[data-renderer-ready="true"]', 45000);
    await clickOrActivate(director + 'button[aria-label="添加角色"]', '.wf-director-root', { kind: 'aria', value: '添加角色' });
    await visible('loc=css:[data-director-workbench] [role="note"]').catch(() => {});
    const actorName = saved.scene.objects.find(item => item.actorPreset === 'standard_female').name;
    await page.waitForFunction(name => [...document.querySelectorAll('[data-director-scene-row]')].some(row => row.getAttribute('data-director-row-label') === name), actorName, { timeout: 30000 });
    const reopened = await publicScene(scenePath);
    assert.equal(reopened.scene.id, saved.scene.id); assert.ok(reopened.revision >= saved.revision);
    assert.deepEqual(reopened.scene.objects, saved.scene.objects);
    assert.deepEqual(reopened.scene.cameras, saved.scene.cameras);
    assert.deepEqual(reopened.scene.shots, saved.scene.shots); assert.equal(reopened.scene.aspectRatio, '9:16');
    await write('reopened-scene.json', reopened); record(phase, { sceneId: reopened.scene.id, revision: reopened.revision });

    step = 'verify-reopened-aspect'; phase = 'aspect-reopened';
    await clickOrActivate(director + 'button[aria-label="选择画幅比例"]', '.wf-director-root', { kind: 'aria', value: '选择画幅比例' });
    assert.equal(await page.evaluate(() => document.querySelector('.wf-director-root button[aria-label="9:16"]')?.getAttribute('aria-pressed')), 'true');
    await page.screenshot({ path: `${evidence}/reopened.png` }); record(phase, { aspectRatio: '9:16' });
    await write('completion.json', { completed: true });
  } catch (error) {
    const diagnosis = await diagnose(error);
    failure = new Error(`Director acceptance failed at ${phase}/${step}: ${diagnosis.error.message ?? diagnosis.error.name}`);
    results.push({ name: phase, passed: false, step, error: diagnosis.error, screenshot: diagnosis.screenshot ?? null });
  } finally {
    try { await write('assertions.json', results); }
    finally { if (task) await write('browser-cleanup.json', await task.finish({ keep: [] })); }
  }
  if (failure) throw failure;
}

function runBrowser(executable, input, timeoutMs) {
  return new Promise(resolveResult => {
    const child = spawn(executable, ['nodejs'], { env: browserEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let settled = false, timedOut = false, output = '';
    const diagnostics = () => output.split('\n').flatMap(line => {
      try { const item = JSON.parse(line); return item.directorDiagnostic === true ? [item] : []; }
      catch { return /(?:SyntaxError|ReferenceError|TypeError|Error:)/.test(line) ? [{ message: line.replace(/https?:\/\/[^\s"'<>]+/g, '[redacted-url]').replace(/token[^\s"']*/gi, '[redacted]').slice(0, 500) }] : []; }
    });
    child.stdout.on('data', bytes => { output += bytes.toString(); });
    child.stderr.on('data', bytes => { output += bytes.toString(); });
    const done = result => { if (!settled) { settled = true; clearTimeout(timer); clearTimeout(killTimer); resolveResult(result); } };
    let killTimer;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); killTimer = setTimeout(() => child.kill('SIGKILL'), 5000); }, timeoutMs);
    child.stdout.resume(); child.stderr.resume(); child.stdin.on('error', () => {});
    child.once('error', error => done({ exitCode: null, code: error.code || 'spawn-error', timedOut }));
    child.once('close', (exitCode, signal) => done({ exitCode, signal, timedOut, diagnostics: diagnostics() }));
    child.stdin.end(input);
  });
}

function independentDecode(evidence) {
  const executable = process.env.DIRECTOR_FFMPEG;
  if (!executable) {
    save(evidence, 'independent-decode.json', { status: 'not-run', reason: 'DIRECTOR_FFMPEG not configured; independent decoding is required for a media proof' });
    throw new Error('DIRECTOR_FFMPEG not configured');
  }
  if (!executable.startsWith('/')) throw new Error('DIRECTOR_FFMPEG must be an explicit absolute executable');
  fs.accessSync(executable, fs.constants.X_OK);
  const invoke = args => {
    const result = spawnSync(executable, ['-v', 'error', '-nostdin', ...args], { encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 });
    if (result.error) throw new Error(`independent decode process budget: ${result.error.code}`);
    if (result.status !== 0) throw new Error(`independent decode must succeed: ${(result.stderr || '').trim().slice(0, 500)}`);
    return result.stdout;
  };
  invoke(['-i', join(evidence, 'composition.png'), '-f', 'null', '-']);
  invoke(['-i', join(evidence, 'reference.webm'), '-f', 'null', '-']);
  const output = invoke(['-i', join(evidence, 'reference.webm'), '-vf', 'fps=1', '-frames:v', '5', '-f', 'framemd5', '-']);
  const frames = output.split('\n').filter(line => line.trim() && !line.startsWith('#')).map(line => line.split(',').at(-1).trim());
  if (frames.length < 4) throw new Error('independent decoder must emit full-duration samples');
  if (new Set([frames[0], frames[Math.floor(frames.length / 2)], frames.at(-1)]).size !== 3) throw new Error('independent first/middle/end must differ');
  save(evidence, 'independent-decode.json', { status: 'passed', frames, pngDecoded: true, entireVideoDecoded: true, executable: 'DIRECTOR_FFMPEG' });
  return { status: 'passed', frames: frames.length };
}

async function main() {
  if (process.env.DIRECTOR_REAL_UI !== '1') log('hint: DIRECTOR_REAL_UI is not set, but this runner is the explicit real-UI entrypoint; continuing');
  const executable = process.env.DIRECTOR_EGO_BROWSER || 'ego-browser';
  const preflight = spawnSync(executable, ['--version'], { env: browserEnv(), encoding: 'utf8', timeout: 10000 });
  if (preflight.error || preflight.status !== 0) throw new Error('PRECONDITION_MISSING: ego executable unavailable');
  const ffmpeg = process.env.DIRECTOR_FFMPEG;
  if (!ffmpeg || !ffmpeg.startsWith('/') || !fs.existsSync(ffmpeg)) throw new Error('PRECONDITION_MISSING: DIRECTOR_FFMPEG absolute executable required');
  // The task-source preparation shells out to bare `python3` for archive inspection; the
  // archive helper mis-reads its GzipFile on Python 3.15 ("read() on write-only GzipFile"),
  // which is a local interpreter incompatibility, not a candidate defect. Prefer a 3.12+
  // interpreter below 3.15 so the reviewed helper runs unchanged.
  const pythonCandidates = ['/usr/local/bin/python3', '/opt/homebrew/bin/python3.12', '/opt/homebrew/bin/python3.13', '/opt/homebrew/bin/python3.14'];
  let python3 = null;
  for (const candidate of pythonCandidates) {
    if (!fs.existsSync(candidate)) continue;
    const version = spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: 10000 });
    const match = /Python (\d+)\.(\d+)/.exec(version.stdout || '');
    if (!match) continue;
    const major = Number(match[1]), minor = Number(match[2]);
    if (major === 3 && minor >= 12 && minor < 15) { python3 = { path: candidate, version: `${major}.${minor}` }; break; }
  }
  if (!python3) throw new Error('PRECONDITION_MISSING: a Python 3.12-3.14 interpreter is required by scripts/managed-tarball-archive.py');
  process.env.PATH = `${dirname(python3.path)}:${process.env.PATH}`;
  log(`using python ${python3.version} (${python3.path}) for task-source archive inspection`);
  fs.mkdirSync(reportRoot, { recursive: true });
  const evidence = fs.mkdtempSync(join(reportRoot, 'acceptance-3289-'));
  log(`evidence: ${evidence}`);
  const projectTitle = `Director Portrait QA ${Date.now()}`;
  const base = spawnSync('git', ['-C', root, 'rev-parse', 'origin/main'], { encoding: 'utf8' }).stdout.trim();
  const head = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const runId = `accept-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const runtime = { startedAt: stamp(), head, base, runId, contract: 'task-source-installed', taskPlugins: ['omnimux-workflow', 'omnimux-automation'], python: python3 };
  let app, failure, assertions, independent;
  try {
    const { startTestEnvironment } = await import('./test-env-bootstrap.mjs');
    app = await startTestEnvironment({
      root,
      mode: 'ui',
      evidenceContext: { taskId: '3289', runId },
      candidate: { base, head },
      taskPlugins: ['omnimux-workflow', 'omnimux-automation'],
    });
    runtime.summary = app.summary;
    runtime.installation = {
      taskId: app.installation?.taskId,
      runId: app.installation?.runId,
      base: app.installation?.base,
      head: app.installation?.head,
      candidateDigest: app.installation?.candidateDigest,
      inputsDigest: app.installation?.inputsDigest,
      packages: (app.installation?.packages ?? []).map(item => ({
        name: item.name,
        version: item.version,
        role: item.role ?? 'task-plugin',
        serverEntry: item.serverEntry ?? null,
        clientBundle: item.clientBundle ?? null,
        archive: item.archive ?? null,
      })),
    };
    runtime.serverLoading = app.serverLoading;
    save(evidence, 'runtime.json', runtime);
    if (app.summary?.mode !== 'ui') throw new Error('task-source runtime mode mismatch');
    if (app.summary?.evidenceLevel !== 'task-source-installed') throw new Error(`evidenceLevel mismatch: ${app.summary?.evidenceLevel}`);
    if (app.summary?.taskPluginsInstalled !== true) throw new Error('task-source runtime did not install task plugins');
    if (app.summary?.taskPluginsCount !== 3) throw new Error(`taskPluginsCount mismatch: ${app.summary?.taskPluginsCount}`);
    if (app.summary?.realModelRequest !== false) throw new Error('task-source runtime must not issue real model requests');
    log(`app ready (evidenceLevel=${app.summary.evidenceLevel}, taskPluginsCount=${app.summary.taskPluginsCount})`);

    // The journey is stringified into a separate node process, so module-scope constants must be
    // passed through the payload instead of being referenced directly.
    const input = `${browserJourney.toString()}\ntry { await browserJourney(${JSON.stringify({ loginUrl: app.loginUrl, evidence, origin: app.origin, projectTitle, paletteLabels: DIRECTOR_PALETTE_LABELS })}); } catch (error) { console.log(JSON.stringify({ directorDiagnostic: true, name: error.name, message: String(error.message).replace(/([?&]token=)[^&\\s"'<>]+/gi, '$1REDACTED') })); throw Error('director-browser-verification-failed'); }`;
    log('starting browser journey');
    const result = await runBrowser(executable, input, 480000);
    save(evidence, 'browser-process.json', result);
    if (result.timedOut) throw new Error(`browser await budget exceeded; see ${evidence}/failure.json`);
    if (result.exitCode !== 0) throw new Error(`browser journey process failed: ${JSON.stringify(result.diagnostics).slice(0, 800)}; see ${evidence}/failure.json`);

    assertions = read(evidence, 'assertions.json');
    save(evidence, 'expected-assertions.json', { expected, actual: assertions.map(item => item.name) });
    const names = assertions.map(item => item.name);
    if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error(`assertion name set mismatch: ${JSON.stringify(names)}`);
    if (!assertions.every(item => item.passed === true)) throw new Error('assertion failure retained in assertions.json');
    if (read(evidence, 'completion.json').completed !== true) throw new Error('journey did not reach completion');
    const cleanup = read(evidence, 'browser-cleanup.json');
    if (cleanup.closedSpace !== true) throw new Error('ego space was not closed');
    if (JSON.stringify(cleanup.keptManagedLabels) !== '[]') throw new Error('ego space retained managed pages');

    const space = read(evidence, 'space.json');
    const spacesFile = join(evidence, 'ego-spaces.json');
    const spacesResult = await runBrowser(executable, `const fs = await import('node:fs/promises');\nconst spaces = await listTaskSpaces();\nawait fs.writeFile(${JSON.stringify(spacesFile)}, JSON.stringify({ spaces: spaces.map(space => ({ id: space.id, ownership: space.ownership })) }, null, 2));\n`, 30000);
    save(evidence, 'browser-spaces-process.json', { exitCode: spacesResult.exitCode, timedOut: spacesResult.timedOut, diagnostics: spacesResult.diagnostics });
    if (spacesResult.exitCode !== 0 || spacesResult.timedOut) throw new Error('could not list ego task spaces after the journey');
    const spaces = read(evidence, 'ego-spaces.json').spaces;
    const retained = spaces.filter(item => item.id === space.spaceId);
    save(evidence, 'browser-spaces-check.json', { spaceId: space.spaceId, retained: retained.length > 0, spaceCount: spaces.length, ownership: [...new Set(spaces.map(item => item.ownership))] });
    if (retained.length) throw new Error('ego task space is still retained after finish()');

    const artifacts = [];
    for (const name of ['composition.png', 'reference.webm', 'playback.png', 'reopened.png', 'camera-properties.png']) {
      if (name === 'camera-properties.png' && !fs.existsSync(join(evidence, name))) continue;
      const bytes = fs.readFileSync(join(evidence, name));
      if (bytes.length <= 1024) throw new Error(`artifact too small: ${name} (${bytes.length} bytes)`);
      const signature = name.endsWith('.png') ? Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) : Buffer.from([26, 69, 223, 163]);
      if (!bytes.subarray(0, signature.length).equals(signature)) throw new Error(`artifact format mismatch: ${name}`);
      artifacts.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    save(evidence, 'artifacts.json', artifacts);
    independent = independentDecode(evidence);
    save(evidence, 'assertions-readback.json', { names, allPassed: true, expected });
    save(evidence, 'completion.json', { ...read(evidence, 'completion.json'), evidenceReadback: true });
    const resultRecord = {
      passed: true,
      acceptanceScope: 'normal-ui-portrait-save-reopen-moving-media',
      completeMigrationAcceptance: false,
      evidenceLevel: app.summary.evidenceLevel,
      taskSourceInstalled: app.summary.evidenceLevel === 'task-source-installed',
      taskPluginsInstalled: app.summary.taskPluginsInstalled,
      taskPluginsCount: app.summary.taskPluginsCount,
      taskPlugins: runtime.taskPlugins,
      runId: runtime.runId,
      base: runtime.base,
      independentDecode: independent.status,
      assertions: names,
      realModelRequest: false,
      head: runtime.head,
      finishedAt: stamp(),
    };
    save(evidence, 'result.json', resultRecord);
    log(`PASS evidence=${evidence}`);
    log(`assertions=${names.join(',')}`);
    log(`independent-decode=${independent.status} frames=${independent.frames}`);
    process.stdout.write(`EVIDENCE_DIR=${evidence}\n`);
  } catch (error) {
    failure = error;
    log(`FAIL ${error?.code || ''} ${error?.message || error}`);
    if (fs.existsSync(evidence)) {
      save(evidence, 'result.json', {
        passed: false,
        acceptanceScope: 'normal-ui-portrait-save-reopen-moving-media',
        completeMigrationAcceptance: false,
        evidenceLevel: app?.summary?.evidenceLevel ?? null,
        taskSourceInstalled: app?.summary?.evidenceLevel === 'task-source-installed',
        contract: runtime.contract,
        taskPlugins: runtime.taskPlugins,
        failure: { name: error?.name ?? 'Error', code: error?.code ?? 'ACCEPTANCE_FAILED', rootReason: error?.rootReason ?? null, hint: error?.hint ?? null, message: String(error?.message ?? '').slice(0, 2000) },
        summary: runtime.summary ?? null,
        head: runtime.head,
        finishedAt: stamp(),
      });
    }
    process.stdout.write(`EVIDENCE_DIR=${evidence}\n`);
  } finally {
    try {
      if (app) { const cleanup = await app.cleanup(); save(evidence, 'cleanup.json', cleanup); if (cleanup.cleaned !== true) throw new Error('app cleanup failed'); }
    } catch (error) { failure ||= error; log(`cleanup-failure ${error?.message || error}`); }
  }
  if (failure) { process.exitCode = 1; return; }
  log('all evidence assertions passed');
}

main().catch(error => {
  log(`fatal ${error?.stack || error}`);
  process.exitCode = 1;
});
