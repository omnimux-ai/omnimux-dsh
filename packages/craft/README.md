# @omnimux/craft

Universal craft knowledge, runtime prompt assembler, and deterministic artifact linter for OmniMux.

## Architecture

This package decouples **universal industrial-grade design & craft discipline** from specific brands:
- **`rules/*.md`**: Markdown rulebooks covering typography, color distribution, anti-ai-slop, UX laws, state coverage, and social/video disciplines.
- **`src/assembler.ts`**: Runtime prompt loader that dynamically compiles `## Active craft references` based on task requirements with zero unnecessary token waste.
- **`src/linter.ts`**: Millisecond deterministic grep linter that enforces P0/P1/P2 standards on model outputs before they reach the user or canvas.

## Usage

```typescript
import { resolveCraftRequirements, loadCraftSections, lintArtifact } from '@omnimux/craft';

// 1. Resolve and inject into Prompt
const slugs = resolveCraftRequirements({
  artifactKind: 'web-prototype',
  skillRequires: ['anti-ai-slop', 'typography'],
});
const { body } = await loadCraftSections('/path/to/rules', slugs);

// 2. Lint model generation output
const findings = lintArtifact(generatedHtml);
const p0Errors = findings.filter(f => f.severity === 'P0');
if (p0Errors.length > 0) {
  // Trigger agent self-correction
}
```
