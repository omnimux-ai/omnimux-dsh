# Plugin: direct upload for gateway media hosting

## Objective and scope

The hub uploads every local media file through the gateway (`POST …/files/upload/stream`), so an asset crosses the gateway twice and its upload is bounded by the gateway's own transfer window. The gateway now also accepts a ticket pair (`…/files/upload/presign` + `…/files/upload/confirm`, see the gateway spec `specs/inspiration-direct-upload.spec.md` there): a caller PUTs the bytes straight into object storage and the gateway verifies what arrived.

This change makes `uploadMediaToGateway` prefer that path and keep the relay route as its fallback, so a plugin running against a gateway that cannot issue tickets behaves exactly as before.

Out of scope: any change to how uploads are requested (payload interception, caching, in-flight sharing), the media host contract, and the download/playback path.

## Acceptance

1. `resolvePresignEndpoint` / `resolveConfirmEndpoint` derive from the same base as `resolveUploadEndpoint`, for both the `/v1`-suffixed and bare base forms.
2. A successful direct upload performs exactly three calls — ticket, PUT to the storage URL (never to the gateway), confirmation — and the returned URL is the confirmed `file_url`.
3. Any failure in that chain (missing ticket, rejected PUT, rejected confirmation, incomplete response) falls back to the relay route within the same upload, and the caller still receives a usable public URL.
4. A base that could not issue tickets is remembered for the process lifetime, so later uploads skip the probe instead of paying for a failed request per file; `clearGatewayUploadCache()` clears that verdict along with the existing caches.
5. Aborting the upload (AbortSignal) is never converted into a fallback attempt.
6. Existing behavior is preserved: cache and in-flight reuse, expiry parsing, error surfaces, and every existing gateway-upload test still pass.

## Structure/style

- `plugins/omnimux/src/media/gateway-upload.js` only: one small route resolver shared by the three endpoints, one `uploadDirectToStorage` helper, one `uploadViaGateway` helper holding the previous relay body verbatim, and a three-line preference in the upload promise.
- Comments state why the fallback exists; no duplicated error-message parsing (one `readUploadErrorMessage` helper).
- Tests live next to the module in `gateway-upload-direct.test.js`, using the existing fake-`fetch` idiom.

## Verify and test

- `node --test src/media/gateway-upload-direct.test.js` covers acceptance 1–5.
- `node --test src/media/gateway-upload.test.js src/media/gateway-upload-boundary.test.js` covers acceptance 6.
- The repository-wide suite has pre-existing failures in `src/text/execute.test.js` (contract submit guard); they reproduce on `origin/main` with this change reverted and are not part of this task.

## Boundaries

- Always: keep the relay route working, keep the public URL contract unchanged, keep secrets out of logs.
- Ask first: any new dependency, any change to the payload-interception contract, any Dev/Prod materialization.
- Never: push to `main`, upload without a gateway-issued ticket, or swallow an abort into a retry.
