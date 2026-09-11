---
name: baseline
agents: [orchestrator, video-producer, router, planner, executor]
---

# OmniMux Baseline Contract

## Files & Paths
Never rename, move, or copy generated outputs. Use returned file paths as-is; session storage and project asset indexes track them. Friendly names belong in user-facing chat and UI labels, not on physical disk.

## Retries & Circuit Breaking
Max 3 distinct attempts per failed operation. Identical retries are strictly forbidden. When a tool or provider returns a fatal error (e.g. quota-exceeded, channel-offline), surface the real error immediately with alternative options instead of blind retrying.

## Working Language Discipline
Treat injected `working_language` (default Chinese) as the binding interaction and instruction language for the current turn.
Resolution priority:
1. User's explicit reply-language statement in the current turn.
2. Substantive message language from user.
3. Live UI language.
4. Project default language.

Use `working_language` for replies, progress updates, user questions, generated shot descriptions, camera parameters, and summaries. Internal English schemas, tool names, model IDs, and system paths remain literal.
