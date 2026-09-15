# Video preview safe process arguments

## Objective and authorization

Close filename command execution in local video breakdown cover extraction,
large-video sampling, and physical-scene duration probing. Local repair of this
finding is authorized; no remote publication, shared-profile change, provider
request, or unrelated workspace change is included.

## Scope and existing behavior

- `plugins/omnimux-video-preview/src/breakdown/analyzerPipeline.js`: pass local
  input and derived cover/sample output paths as literal process arguments.
- `plugins/omnimux-video-preview/src/scene-detect.js`: pass the duration-probe
  path as a literal process argument; retain the existing safe scene-filter call.
- Use Node's existing `execFileSync` API with no shell and no new dependency.
  Preserve the existing command options, argument order, timeouts, cached-output
  reuse, 20 MiB sampling boundary, and error fallbacks.
- Documentation impact: this task specification records the security invariant;
  no product behavior, tool schema, UI, or public configuration changes.

## Acceptance criteria

1. Call the exported breakdown pipeline with existing local MP4 paths containing
   `$()`, backticks, quotes, spaces, and Unicode. Stub only external programs and
   model completion; no model or other network request is made.
2. Cover and sample programs receive the original source path and derived output
   paths byte-for-byte as single arguments. The probe receives the original path
   as one argument. No injected marker command executes.
3. Ordinary videos still yield a cover; videos larger than 20 MiB use the sample
   for model analysis while smaller videos use the source. Cached cover/sample
   files avoid repeated conversion.
4. The existing probe and scene-filter output still yields expected intervals.
   Cover failure leaves the fallback cover intact, sample failure uses the
   original video, and probe failure preserves scene fallback behavior.
5. Source syntax, the focused regression tests, and all owning package tests pass.

## Implementation plan and style

1. Independently trace direct callers and reconcile the fresh boundary report.
2. Commit this specification before editing business source.
3. Replace only the three shell invocations using the existing style, for example
   `execFileSync('ffmpeg', ['-i', localVideoPath], { timeout: 5000 })`.
4. Before formal tests, exercise actual exported paths with worktree-contained
   subprocess fixtures and record verification evidence.
5. Add focused Node test-runner regressions grounded in the observed calls, run
   checks, and supply the scoped candidate for the parent's independent review.

## Verification commands

- `node --check plugins/omnimux-video-preview/src/breakdown/analyzerPipeline.js`
- `node --check plugins/omnimux-video-preview/src/scene-detect.js`
- `node --test plugins/omnimux-video-preview/test/process-arguments.test.js`
- `pnpm --filter omnimux-video-preview test`
- `git diff --check`

The backend-only change requires no browser or Dev acceptance. Tests use temporary
files beneath this task's worktree and clean them after use. Always preserve
unrelated edits and existing checks. Ask before scope expansion or publication.
Never read credentials, call providers, or execute injected commands outside the
controlled fixture directory.

## Open questions

No product decision is needed for the literal-argument invariant. Independent
boundary review and the parent's candidate review remain required evidence.
