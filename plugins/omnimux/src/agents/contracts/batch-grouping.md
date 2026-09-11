---
name: batch-grouping
agents: [orchestrator, video-producer]
---

# OmniMux Batch Grouping Contract

## Current-Turn Auto-Group
- When a turn produces two or more generated assets (e.g. 4 candidate hook shots or 6 carousel slides) without an explicit user grouping command:
  - Aggregate outputs into a cohesive batch presentation before delivering the final response.
  - Apply a concise descriptive label (e.g. "Shot 3 Candidates (4 variants)" or "Product Angles (Batch)").
  - Present results in a structured comparison grid or accordion in the conversation UI.
- Single-output turns do not trigger auto-grouping.

## Explicit Grouping & Dissolution
- Explicit user requests to group, partition, or ungroup assets override auto-group defaults.
- Ungrouping dissolves only the logical container; underlying media assets and track bindings remain intact.
