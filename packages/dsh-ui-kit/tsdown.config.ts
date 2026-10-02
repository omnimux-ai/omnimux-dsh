import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "tsdown";

const CSS_PREFIX = "\0dsh-ui-kit-css:";
const CSS_SUFFIX = ".mjs";
const EXTERNALS = [
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/dsh-client-ui-primitives",
] as const;

function hashClass(file: string, local: string): string {
  const base = basename(file, ".module.css").replace(/[^A-Za-z0-9_-]/g, "-");
  return `dshUk-${base}-${local}`;
}

/**
 * Stable CSS Modules transform for the library build.
 * Local class selectors become `dshUk-<file>-<local>`; the mapping is
 * injected at module load so consumers do not need a CSS pipeline.
 */
function transformCssModule(file: string, source: string): { css: string; map: Record<string, string> } {
  const map: Record<string, string> = {};
  const css = source.replace(/\.([A-Za-z_][\w-]*)/g, (_full, local: string) => {
    const hashed = hashClass(file, local);
    map[local] = hashed;
    return `.${hashed}`;
  });
  return { css, map };
}

function cssModulesPlugin() {
  const injectHelper = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "src/internal/injectCss.ts",
  );

  return {
    name: "dsh-ui-kit-css-modules",
    resolveId(source: string, importer?: string) {
      if (!source.endsWith(".module.css")) return null;
      const file = importer === undefined ? source : resolve(dirname(importer), source);
      return `${CSS_PREFIX}${file}${CSS_SUFFIX}`;
    },
    async load(id: string) {
      if (!id.startsWith(CSS_PREFIX)) return null;
      const file = id.slice(CSS_PREFIX.length, -CSS_SUFFIX.length);
      const raw = await readFile(file, "utf8");
      const { css, map } = transformCssModule(file, raw);
      return [
        `import { injectCss } from ${JSON.stringify(injectHelper)};`,
        `injectCss(${JSON.stringify(basename(file))}, ${JSON.stringify(css)});`,
        `export default ${JSON.stringify(map)};`,
      ].join("\n");
    },
  };
}

export default defineConfig({
  name: "dsh-ui-kit",
  entry: { index: "src/index.ts" },
  outDir: "lib",
  format: "esm",
  platform: "neutral",
  target: "es2022",
  dts: true,
  clean: true,
  sourcemap: true,
  fixedExtension: false,
  deps: {
    neverBundle: [...EXTERNALS],
  },
  plugins: [cssModulesPlugin()],
});
