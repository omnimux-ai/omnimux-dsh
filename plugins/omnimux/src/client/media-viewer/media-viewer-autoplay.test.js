import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('MediaViewerTab: single video view must not have autoPlay attribute to avoid unrequested playback', () => {
  const jsxPath = resolve(__dirname, 'MediaViewerTab.jsx');
  const content = readFileSync(jsxPath, 'utf8');

  // Check the single video stage block
  const videoSingleMatch = content.match(/activeItem\?\.type === 'video'\s*\?\s*\(\s*<video[^>]+>/);
  assert.ok(videoSingleMatch, 'Must render video element when activeItem is video');

  const videoTag = videoSingleMatch[0];
  assert.equal(
    videoTag.includes('autoPlay'),
    false,
    'Single media viewer video element must NOT carry autoPlay attribute'
  );
  assert.ok(videoTag.includes('controls'), 'Video must have controls for user-initiated playback');
  assert.ok(videoTag.includes('playsInline'), 'Video must retain playsInline attribute');
});
