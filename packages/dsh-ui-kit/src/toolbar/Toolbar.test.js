import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const TSX_PATH = join(here, "Toolbar.tsx");
const tsx = readFileSync(TSX_PATH, "utf8");

describe("FilterBar contract", () => {
  it("exports FilterBar supporting standard and classic split layouts", () => {
    assert.match(tsx, /export function FilterBar/);
    assert.match(tsx, /tools\?: ReactNode/);
  });
});
