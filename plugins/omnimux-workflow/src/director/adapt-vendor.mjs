// Task-owned reproducible adaptation, never reads the source repository at runtime.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
for (const category of ['components', 'lib']) {
  for (const name of readdirSync(join(root, 'vendor', category))) {
    const path = join(root, 'vendor', category, name);
    let text = readFileSync(path, 'utf8');
    text = text.replaceAll('from "antd"', 'from "../../controls"').replaceAll('from "rc-menu/lib/interface"', 'from "../../controls"');
    text = text.replaceAll('"@/components/ui/base/switch"', '"../../controls"').replaceAll('"@/components/ui/base/tooltip"', '"../../controls"');
    for (const old of ['@/lib/user-scope-guard', '@/services/image-storage', '@/services/file-storage', '@/lib/localforage-storage', '@/lib/user-scope', '@/services/diagnostics/client-diagnostics']) text = text.replaceAll(`"${old}"`, '"../../services"');
    text = text.replaceAll('localForageStorageForScope', 'preferenceStorage');
    text = text.replaceAll('"@/stores/canvas/use-director-workbench-store"', '"../store/use-director-workbench-store"');
    text = text.replaceAll('import { canvasThemes } from "@/lib/canvas-theme";', 'import { directorTheme } from "../../services";');
    text = text.replaceAll('import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";', '');
    text = text.replaceAll('canvasThemes[useActiveTheme()]', 'directorTheme');
    text = text.replaceAll('import { useAssetStore, type ImageAsset, type ModelAsset } from "@/stores/use-asset-store";', 'import { useDirectorAssets as useAssetStore, type ImageAsset, type ModelAsset } from "../../services";');
    text = text.replaceAll('import type { CanvasNodeData } from "@/types/canvas";', 'import type { CanvasNodeData } from "../../services";');
    text = text.replaceAll('import type { ReferenceImage } from "@/types/image";', 'import type { ReferenceImage } from "../../services";');
    text = text.replaceAll('/canvas/models/', 'director/models/');
    // Portals remain inside this editor root, not the canvas/host document body.
    if (text.includes('document.body')) {
      text = 'import { directorPortal } from "../../services";\n' + text;
      text = text.replaceAll('document.body', 'directorPortal()');
    }
    writeFileSync(path, text);
  }
}
