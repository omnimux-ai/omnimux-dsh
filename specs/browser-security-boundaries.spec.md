# Browser security boundaries — #1972

## Scope
Close findings 8, 16 and 17 using the existing extension pairing and browser media paths.

## Acceptance
- Every bridge connection requires the configured bearer token, irrespective of origin; failed authentication cannot replace a paired connection.
- Only the current embedded extension panel can request page form writes. Foreign frames, page messages and stale panel windows cannot write or trigger input events.
- Hover-selected media travels through a one-use extension-runtime authorization bound to the source tab. Page-controlled window messages cannot choose a host download URL. Native side-panel selection continues to work.
- Every HTTP media hop resolves only public addresses and connects using that exact checked lookup result, retaining the original HTTPS hostname. Mixed/private DNS answers and redirects fail before connection. Existing response size, timeout and status behavior remains.

## Verification
Synthetic socket/token, injected DNS/transport, and message-boundary tests with no real credentials or external requests. Parent retains isolated browser evidence: legitimate panel fill and hover attachment, sibling-frame/page forgery no mutation/download, ordinary native panel operation. No visual redesign.

## Native carrier compatibility follow-up
- Preserve direct bridge media outcomes intact, including explicit failed/timeout statuses.
- Unwrap only a complete `server-response` with a nonempty carrier RPC id (the port and socket correlate independently) and a valid success-value or structured failure union.
- Propagate transport failures and valid business failures; do not mistake ordinary/near-match objects for envelopes.
- Rebuild the actual MV3 extension and require actual iframe/runtime media attachment receipt `ok:true` plus a decoded pending attachment after real hover/click. Synthetic host must send the same wire shapes as production.
