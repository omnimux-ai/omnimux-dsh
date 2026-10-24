import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCandidateEntry, candidateDirectoryIndex, missingPackageDependencies } from './test-env-bootstrap.mjs';

// A worktree that ran the standard dependency install also contains `lib/` and `dist/` build
// outputs written by package `prepare` scripts. They are excluded from the captured candidate, so
// staging must skip them instead of rejecting the whole preparation as unsupported input.
test('candidate input classification skips rebuildable outputs and rejects candidate-owned symlinks', () => {
  const allowed = new Set(['plugins/x/package.json', 'plugins/x/src/a.js']);
  const candidateDirectories = candidateDirectoryIndex(allowed);
  assert.ok(candidateDirectories.has('plugins/x'));
  assert.ok(candidateDirectories.has('plugins/x/src'));
  const entry = (rel, kind, allowAll) => ({
    allowed, candidateDirectories, rel, allowAll: allowAll === true,
    isSymbolicLink: kind === 'link', isDirectory: kind === 'dir', isFile: kind === 'file',
  });
  assert.equal(classifyCandidateEntry(entry('plugins/x/lib/client.js', 'file')), 'skip');
  assert.equal(classifyCandidateEntry(entry('plugins/x/lib', 'dir')), 'skip');
  assert.equal(classifyCandidateEntry(entry('plugins/x/src/a.js', 'file')), 'copy');
  assert.equal(classifyCandidateEntry(entry('plugins/x/src', 'dir')), 'recurse');
  assert.equal(classifyCandidateEntry(entry('plugins/x/link', 'link')), 'skip');
  assert.equal(classifyCandidateEntry(entry('plugins/x/src/a.js', 'link')), 'unsupported-symlink');
  assert.equal(classifyCandidateEntry(entry('plugins/x/fifo', 'special')), 'unsupported-special');
  // The stage→pack copy (`allowAll`) must still carry build outputs, and still refuses links.
  assert.equal(classifyCandidateEntry(entry('plugins/x/lib', 'dir', true)), 'recurse');
  assert.equal(classifyCandidateEntry(entry('plugins/x/lib/client.js', 'file', true)), 'copy');
  assert.equal(classifyCandidateEntry(entry('plugins/x/lib/link', 'link', true)), 'unsupported-symlink');
});

// A worktree without the standard install used to fail deep inside a package build with only
// PREPARE_BUILD_FAILED. The early check must name exactly the packaged targets that need install.
test('missing dependency check names only declared, uninstalled targets', () => {
  const packedPaths = ['packages/dsh-ui-kit', 'plugins/omnimux-workflow', 'plugins/no-deps'];
  const installed = new Set(['plugins/no-deps']);
  const declared = new Set(['packages/dsh-ui-kit', 'plugins/omnimux-workflow']);
  const run = () => missingPackageDependencies({
    packedPaths,
    hasInstalledDependencies: rel => installed.has(rel),
    declaresDependencies: rel => declared.has(rel),
  });
  assert.deepEqual(run(), ['packages/dsh-ui-kit', 'plugins/omnimux-workflow']);
  installed.add('packages/dsh-ui-kit');
  assert.deepEqual(run(), ['plugins/omnimux-workflow']);
});
