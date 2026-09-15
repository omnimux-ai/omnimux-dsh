# Local HTTP security boundaries #1970

## Acceptance
- Clip reads and writes, text generation, workbench context changes, and authentication mutations require Host authorization and exact request origin; hostile, null, malformed, cross-site or wrong-port browser requests have no side effects.
- Missing or failing Host authorization fails closed. Authenticated native requests without browser headers remain supported; authenticated same-origin browser clients retain behavior.
- Translation HTTP follows the same boundary. Persistence accepts only actual breakdown artifacts, retaining .json and .vbreakdown and nonpersistent translations. Invalid targets fail before model execution or writes.
- Browser copilot generation uses its existing authenticated bridge and never probes anonymous completion routes.
- Focused synthetic route tests prove refusals and valid controls. Parent coordinates isolated real-browser acceptance and fresh independent review before delivery.

## Review regression controls
- Browser copilot uses authenticated unary Hub completion and waits for actual text; accepted-only session receipts never count as generated text. Service errors and bounded timeout are returned to the caller.
- Existing analysis JSON with well-formed shots and structure remains translatable/cacheable without requiring a newer marker. Arbitrary JSON remains rejected.
- Signing-related route and breakdown tests must create their own temporary DSH_HOME, restore the prior value, and remove their temporary files; authorization success uses an owned media file and verifies the returned file grant.
