# Twitter inactive reply icon — #1766

## Objective
An inactive reply composer with an already mounted contenteditable tweetTextarea_0 and no visible toolBar must retain exactly one usable OmniMux icon. An expanded composer must retain one bottom-row icon without stale corner icons.

## Acceptance
- Open a real X status page in Ego. Observe the native inactive textarea and disabled reply button; save DOM structure and screenshot.
- Run the task-worktree implementation in this page without changing the shared installed extension/profile. The inactive icon has positive geometry, is outside the disabled native button and appears beside it.
- Click the assistant icon using browser input: the real assistant menu opens; the native editor remains inactive (no toolbar appears and textarea does not receive focus).
- Close the menu, click the native editor: a visible toolbar appears and exactly one assistant remains next to its reply button. Repeat mounting/cleanup without duplicates.
- Reload/return to inactive and verify the same behavior. Never publish a reply or invoke paid generation.
- Capture real PNGs and structured results; DOM simulations are regression tests only, not browser acceptance.

## Commands
From plugins/omnimux-browser/extension: `pnpm test`, `pnpm typecheck`, `pnpm build`. Repository: `git diff --check`.

## Structure
Source: plugins/omnimux-browser/extension/src/content/twitter-copilot/anchor.ts.
Tests: plugins/omnimux-browser/extension/tests/twitter-copilot.spec.ts.
Evidence: .workbuddy/evidence/twitter-reply-textarea-1766/ in this worktree.

## Code style
Use existing TypeScript helpers and brand icon/styles. Example: `if (!toolbar) return false`. No redesign, dependency additions, or synthetic production DOM.

## Testing strategy
After real-browser walkthrough, add regressions for textarea-without-toolbar, hidden toolbar, native flex button sibling mounting, expanded orphan rejection and repeated cleanup. Preserve existing regression suite. Independent review checks latest diff and evidence before PR merge.

## Boundaries
Always preserve shared profiles and primary checkout, isolate task code, accurately label injected-source real-page verification versus installed-extension acceptance. Ask only for expanded scope or human-only authorization. Never post, alter credentials, bypass checks, claim simulated evidence as live, or ship unmerged code to shared Dev/Prod.

## Documentation impact
This corrective spec documents the real inactive DOM contract; existing simulation-report wording will be corrected if touched. No product capability or design changes.
