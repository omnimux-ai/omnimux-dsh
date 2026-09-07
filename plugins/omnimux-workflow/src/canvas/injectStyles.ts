/**
 * Shared stylesheet injector — used by the production island entry
 * (index.tsx) and the dev harness (harness/harness.tsx) so both load the
 * exact same CSS in the exact same order (计划 §6 坑#2：注入数组化，
 * xyflow base → theme → components 单点注入，顺序不可变)。
 *
 * esbuild text-loader: stylesheets arrive as strings and must be
 * injected manually (Vite did this automatically in the spike sandbox).
 */
import xyflowCss from '@xyflow/react/dist/style.css';
import themeCss from './theme/workbench-theme.css';
import componentsCss from './theme/components.css';
import tableNodeCss from './theme/table-node.css';
import textStageCss from './components/text-stage/text-stage.css';
import promptTokenEditorCss from './editor/components/PromptTokenEditor/promptTokenEditor.css';

const STYLESHEETS: Array<{ id: string; css: string }> = [
  { id: 'omnimux-workflow-xyflow-base', css: xyflowCss },
  { id: 'omnimux-workflow-theme', css: themeCss },
  { id: 'omnimux-workflow-components', css: componentsCss },
  { id: 'omnimux-workflow-table-node', css: tableNodeCss },
  { id: 'omnimux-workflow-text-stage', css: textStageCss },
  { id: 'omnimux-workflow-prompt-token-editor', css: promptTokenEditorCss },
];

export function injectCanvasStyles(): void {
  for (const { id, css } of STYLESHEETS) {
    const existing = document.getElementById(id);
    if (existing instanceof HTMLStyleElement) {
      if (existing.textContent !== css) {
        existing.textContent = css;
      }
    } else {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = css;
      document.head.append(style);
    }
  }
}
