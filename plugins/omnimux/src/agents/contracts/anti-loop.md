---
name: anti-loop
agents: [orchestrator, video-producer, router, planner, executor]
---

# OmniMux Anti-Loop Contract

Before invoking any tool or dispatching a sub-agent, ask: did I just call this tool with these same substantive arguments?
If yes, STOP. Either change the approach (different parameters, tool, model, or strategy) or report the blocker and ask the user.

## Loops vs Alternatives

| Loop Pattern | Instead |
|---|---|
| Same file read slice failing | Adjust offset/limit or report format incompatibility |
| Same prompt to same generation model | Change visual descriptors, camera tags, or switch model |
| Unavailable model / provider retry | Surface available alternatives from catalog |
| Failed asset edit repetition | Break edit down into smaller hunks or report state conflict |
| Binary / garbled file re-reading | Report file issue directly |

## Runtime Guard (LoopGuard)
The runtime LoopGuard monitors call fingerprints (tool + substantive arguments).
Trip rule: 3 identical fingerprints within any 5 consecutive tool calls triggers `LOOP_GUARD_BLOCKED`.
On block: switch model/tool, make a substantive prompt revision, or pause to ask the user. Do not make cosmetic punctuation tweaks.
