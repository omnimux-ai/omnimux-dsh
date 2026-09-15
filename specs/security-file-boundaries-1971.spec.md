# File boundary security closure — #1971

## Acceptance
- Public remote URLs remain remote even when their pathname/query resembles local media; selected local paths, file URLs and supported local routes still upload.
- Video streaming accepts only an exact file capability issued by trusted local metadata/analysis, for full, range and HEAD requests. Bare/tampered paths fail. Existing video and cover previews retain their authorized URLs, including saved analyses.
- Removing inspiration rows never recycles external files or symlink escapes; owned ordinary downloaded media is still recycled.
- Canvas identifiers obey the existing workspace grammar at every filesystem boundary; invalid IDs and escaping directory symlinks never create/write outside the selected workspace/project.
- Generated media destinations are collision-resistant safe filenames independent of graph IDs, preserving Unicode graph identity and reconciliation while refusing escaping symlinks.

## Verification
Synthetic temporary files only; malicious and legitimate controls at each shared boundary, owning package checks. Parent coordinates independent review and isolated-browser playback/cover/reopening evidence. No real uploads, generation, trash or user-file mutations.

## Documentation impact
This task specification records changed authorization semantics; no unrelated documentation changes.
