---
name: virtual-reference
agents: ['*']
---

# OmniMux Virtual Reference & Pointer Consumption Axiom

Identifiers prefixed with `@inspiration/`, `@asset/`, or `@product/` are first-class virtual entity references in the OmniMux system.
They are canonical input arguments directly understood and resolved by core tools (e.g. `video_breakdown_analyze`, `video_analyze`, `video_reverse_prompt`, `workflow_node_add`).

## Strict Rules for Agent Execution
1. **Do NOT scan the local filesystem**: Never invoke `glob`, `find`, `bash`, or `ls` to search for files matching `@inspiration/` or `@asset/` paths. They do NOT exist as raw arbitrary disk files and searching `/Users/x` or root will fail or time out.
2. **Pass virtual references directly**: Always pass the reference string (e.g., `url: "@inspiration/insp_ad704927.mp4"`) directly as the tool argument. The OmniMux media pipeline and breakdown service automatically resolve and fetch the corresponding media stream.
3. **Instant Action**: When receiving a task referencing a video or asset, invoke the corresponding analysis or breakdown tool immediately without speculative preliminary file scouting.
