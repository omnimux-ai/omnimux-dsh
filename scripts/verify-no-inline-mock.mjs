import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(fileURLToPath(import.meta.url), "../../");

const CLIENT_SRC_DIRS = [
  "plugins/omnimux/src/client",
  "plugins/omnimux-workflow/src/client",
  "plugins/omnimux-apps/src/client",
  "plugins/omnimux-assets/src/client",
  "plugins/omnimux-video/src/client",
  "plugins/omnimux-clip/src/client",
  "plugins/omnimux-inspiration/src/client",
];

const SOURCE_EXT_RE = /\.(jsx?|tsx?)$/;
const EXCLUDE_PATHS = ["/tests/", "/test/", "/__tests__/", "/fixtures/", "/__mocks__/"];

const FORBIDDEN_IDENTIFIERS = [
  /\bDEFAULT_PRODUCTS\b/,
  /\bMOCK_PRODUCTS\b/,
  /\bSAMPLE_PRODUCTS\b/,
  /\bDEFAULT_ITEMS\b/,
  /\bMOCK_ITEMS\b/,
];

const FORBIDDEN_BUSINESS_MOCKS = [
  "智能降噪真无线耳机",
  "超轻透气缓震跑鞋",
  "极简便携桌面加湿器",
  "极简智能触控保温杯",
];

function collectFiles(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (!EXCLUDE_PATHS.some((p) => fullPath.includes(p))) {
          results.push(...collectFiles(fullPath));
        }
      } else if (stat.isFile() && SOURCE_EXT_RE.test(entry)) {
        if (!EXCLUDE_PATHS.some((p) => fullPath.includes(p))) {
          results.push(fullPath);
        }
      }
    }
  } catch {
    // ignore
  }
  return results;
}

export function auditInlineMocks(rootDir = REPO_ROOT) {
  const violations = [];
  let scannedCount = 0;

  for (const srcDir of CLIENT_SRC_DIRS) {
    const absDir = join(rootDir, srcDir);
    const files = collectFiles(absDir);

    for (const filePath of files) {
      scannedCount += 1;
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const relPath = relative(rootDir, filePath);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        for (const pattern of FORBIDDEN_IDENTIFIERS) {
          if (pattern.test(line) && !line.includes("verify-no-inline-mock")) {
            violations.push({
              file: relPath,
              line: lineNum,
              text: line.trim(),
              reason: "Forbidden mock identifier [" + pattern.source + "]",
            });
          }
        }

        for (const keyword of FORBIDDEN_BUSINESS_MOCKS) {
          if (line.includes(keyword)) {
            violations.push({
              file: relPath,
              line: lineNum,
              text: line.trim(),
              reason: "Forbidden hardcoded business string [" + keyword + "]",
            });
          }
        }
      }
    }
  }

  return { violations, scannedCount };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { violations, scannedCount } = auditInlineMocks(REPO_ROOT);

  if (violations.length > 0) {
    console.error("\n❌ [verify-no-inline-mock] Inlined hardcoded mock data violations detected!\n");
    for (const v of violations) {
      console.error("  - " + v.file + ":" + v.line);
      console.error("    Reason: " + v.reason);
      console.error("    Code:   " + v.text + "\n");
    }
    console.error("Rule: Frontend client components must NOT inline hardcoded business data arrays! Data must come asynchronously from official Seams/Routes.\n");
    process.exit(1);
  } else {
    console.log("✅ [verify-no-inline-mock] Passed: " + scannedCount + " client source files clean of inlined mock data.");
    process.exit(0);
  }
}
