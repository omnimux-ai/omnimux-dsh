import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMediaRevision } from './mediaRevision.ts';

test('local media revisions detect same URL replacement, aliases and missing files', () => {
  const root = mkdtempSync(join(tmpdir(), 'cover-version-'));
  try {
    const file = join(root, 'image.png');
    writeFileSync(file, 'first');
    const version = createMediaRevision(root, (workspace, relative) => {
      assert.equal(workspace, 'ws'); assert.equal(relative, 'image.png'); return file;
    });
    const url = '/omnimux-workflow/api/workspaces/ws/file?rel=image.png';
    const first = version(url);
    assert.equal(version('/omnimux-workflow/api/project-file?workspace=ws&rel=image.png'), first);
    writeFileSync(file, 'replacement bytes');
    assert.notEqual(version(url), first);
    assert.equal(version('https://example.com/image.png'), '');
    assert.equal(version('/omnimux-workflow/media/image.png'), version(url));
    rmSync(file);
    assert.throws(() => version(url));
    symlinkSync(tmpdir(), file);
    assert.throws(() => version('/omnimux-workflow/media/image.png'), /outside-root/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
