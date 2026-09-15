# Security remote content boundaries (#1973)

## Acceptance
- Product page and image requests reject private literal or DNS results before connection; validated addresses are used by the socket without a second lookup. Every redirect is independently checked. Public CDN, IPv6 and signed image URLs remain usable.
- Existing SVG previews in Products, Assets and Workflow are inert as standalone documents and remain image-embeddable; normal media and byte ranges remain usable. Parent performs isolated real-browser script-marker and image rendering checks.
- Remote image/video/audio bodies stop and cancel at explicit byte limits, including absent/lying length headers; no unbounded arrayBuffer fallback. Asset metadata probes execute sequentially and retain metadata only.
- Offline regression tests cover malicious and valid transport/stream cases. No real network, credentials or production changes.

## Retained browser verification
Parent-owned isolated browser evidence: `.agent-reports/security-all-20260915/svg-browser-dom.json`, `svg-browser-result.json`, `svg-browser-inert.png`, `svg-browser-direct.png`.
Reusable actual-route fixture: `plugins/omnimux-products/tests/fixtures/security-svg-server.mjs`; run with repository root as cwd. It binds a dynamic loopback port, uses synthetic temporary SVG only, prints the URL/PID, and deletes its temporary directory on SIGTERM/SIGINT. It does not launch a browser or create an ego TaskSpace.
Observed checks: all four embedded images have positive geometry and naturalWidth 420; SVG document frames and direct navigation retain “SVG image visible; script inert”; the explicitly visited unprotected positive control changes to “SCRIPT EXECUTED”; `/state` records only positive-control; Workflow 206 includes the same CSP and nosniff headers. Existing parent TaskSpace is reused for any rerun.
