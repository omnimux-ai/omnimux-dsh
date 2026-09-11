/**
 * Deterministic Craft Linter for generated artifacts.
 *
 * Grep-style, lightweight, sub-millisecond static analyzer that catches AI slop
 * and craftsmanship violations before artifacts reach the canvas or user.
 */

export type CraftLintSeverity = 'P0' | 'P1' | 'P2';

export interface CraftLintFinding {
  severity: CraftLintSeverity;
  id: string;
  message: string;
  fix: string;
  snippet?: string;
}

const AI_DEFAULT_INDIGO = [
  '#6366f1', '#4f46e5', '#4338ca', '#3730a3',
  '#8b5cf6', '#7c3aed', '#a855f7',
];

const TRUST_GRADIENT_BLUE_HEXES = [
  '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a',
  '#60a5fa', '#93c5fd', '#bfdbfe', '#0ea5e9', '#0284c7',
  '#0369a1', '#38bdf8', '#7dd3fc',
];

const TRUST_GRADIENT_CYAN_HEXES = [
  '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63',
  '#22d3ee', '#67e8f9', '#a5f3fc',
];

const SLOP_EMOJI = [
  '✨', '🚀', '🎯', '⚡', '🔥', '💡', '🌟', '🏆',
  '📈', '🎨', '🛡️', '💪', '🎉',
];

const INVENTED_METRIC_PATTERNS = [
  /\b10×\s+(faster|better|easier)\b/i,
  /\b100×\s+(faster|better)\b/i,
  /\b99\.\d+%\s+uptime\b/i,
  /\bzero[- ]downtime\b/i,
  /\b3×\s+more\s+(productive|efficient)\b/i,
];

const FILLER_PATTERNS = [
  /\bfeature\s+(one|two|three|1|2|3)\b/i,
  /\blorem\s+ipsum\b/i,
  /\bdolor\s+sit\s+amet\b/i,
  /\bplaceholder\s+text\b/i,
  /\bsample\s+content\b/i,
];

const DISPLAY_SANS_RE =
  /(?:h1|h2|h3|\.h-?(?:hero|xl|lg|md))[^{}]*\{[^}]*font-family\s*:\s*["']?(?:Inter|Roboto|Arial|-apple-system|system-ui|SF\s+Pro)/i;

function escapeRe(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clip(str: string, maxLength = 80): string {
  const clean = str.replace(/\s+/g, ' ').trim();
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength)}…`;
}

/**
 * Strips global theme/token definition blocks so intentional `--accent: #6366f1` doesn't false-flag.
 */
function stripTokenBlocks(css: string): string {
  return css
    .replace(/:root\s*\{[^}]*\}/gi, '')
    .replace(/\[data-theme=[^\]]*\]\s*\{[^}]*\}/gi, '');
}

/**
 * Detects blue→cyan two-stop trust gradient.
 */
function detectBlueCyanTrustGradient(html: string): string | null {
  const gradientMatches = html.matchAll(/linear-gradient\([^)]*\)/gi);
  for (const match of gradientMatches) {
    const body = match[0].toLowerCase();
    const hasBlue = TRUST_GRADIENT_BLUE_HEXES.some((hex) => body.includes(hex)) || /\b(blue|sky)\b/.test(body);
    const hasCyan = TRUST_GRADIENT_CYAN_HEXES.some((hex) => body.includes(hex)) || /\b(cyan|teal)\b/.test(body);
    if (hasBlue && hasCyan) {
      return match[0];
    }
  }
  return null;
}

/**
 * Lints an HTML / canvas artifact string against the Universal Craft Rules.
 */
export function lintArtifact(rawInput: unknown): CraftLintFinding[] {
  const findings: CraftLintFinding[] = [];
  if (typeof rawInput !== 'string' || rawInput.length === 0) return findings;

  // Strip HTML comments to avoid false-flagging documentation samples
  const html = rawInput.replace(/<!--[\s\S]*?-->/g, '');

  // ── P0-1: Purple / Violet / Indigo Gradient ──
  const purpleGradientMatch = /linear-gradient\([^)]*(?:#6366f1|#4f46e5|#4338ca|#8b5cf6|#7c3aed|#a855f7|#9333ea|purple|violet)[^)]*\)/i.exec(html);
  if (purpleGradientMatch) {
    findings.push({
      severity: 'P0',
      id: 'purple-gradient',
      message: 'Found a violet/indigo gradient — anti-slop rules strictly forbid AI trust gradients.',
      fix: 'Use a flat background surface (var(--bg) / var(--surface)) or an intentional single-tone theme token.',
      snippet: clip(purpleGradientMatch[0]),
    });
  }

  // ── P0-2: Blue→Cyan Two-stop Trust Gradient ──
  if (!findings.some((f) => f.id === 'purple-gradient')) {
    const trustGradient = detectBlueCyanTrustGradient(html);
    if (trustGradient) {
      findings.push({
        severity: 'P0',
        id: 'trust-gradient',
        message: 'Found a blue→cyan two-stop trust gradient — canonical SaaS AI-slop hero cliché.',
        fix: 'Replace with a flat background surface and rely on typography and layout structure for hierarchy.',
        snippet: clip(trustGradient),
      });
    }
  }

  // ── P0-3: Default Tailwind Indigo Hardcoded Accent ──
  const htmlWithoutTokens = stripTokenBlocks(html);
  for (const hex of AI_DEFAULT_INDIGO) {
    const re = new RegExp(escapeRe(hex), 'i');
    const m = re.exec(htmlWithoutTokens);
    if (m) {
      findings.push({
        severity: 'P0',
        id: 'ai-default-indigo',
        message: `Found hardcoded default LLM accent color (${hex}) outside of token definitions.`,
        fix: 'Use var(--accent) or var(--dsw-alias-primary). Do not default to Tailwind indigo.',
        snippet: clip(m[0]),
      });
      break;
    }
  }

  // ── P0-4: Emoji as Feature / UI Icons ──
  for (const emoji of SLOP_EMOJI) {
    if (html.includes(emoji)) {
      const structuralRe = new RegExp(
        `<(?:h[1-6]|button|li|span[^>]*class=["'][^"']*icon[^"']*")[^>]*>[^<]*${escapeRe(emoji)}`,
        'i',
      );
      const m = structuralRe.exec(html);
      if (m) {
        findings.push({
          severity: 'P0',
          id: 'emoji-icon',
          message: `Emoji "${emoji}" used as a UI icon inside structural heading, button, or list.`,
          fix: 'Replace with a clean 1.6–1.8px monoline SVG icon using currentColor, or remove the icon.',
          snippet: clip(m[0]),
        });
        break;
      }
    }
  }

  // ── P0-5: Rounded Card with Colored Left-Border Accent ──
  const leftAccentRe =
    /(?:\{|\bstyle=["'][^"']*)(?:[^;"']*border-left\s*:\s*[1-9]\d*px\s+solid[^;"']*;[^;"']*border-radius\s*:\s*[1-9]|[^;"']*border-radius\s*:\s*[1-9][^;"']*;[^;"']*border-left\s*:\s*[1-9]\d*px\s+solid)/i;
  const cardMatch = leftAccentRe.exec(html);
  if (cardMatch) {
    findings.push({
      severity: 'P0',
      id: 'left-accent-card',
      message: 'Found rounded card with a colored left border — the canonical "AI dashboard tile" shape.',
      fix: 'Drop either the border-radius (make it sharp 0px) or drop the left accent border and use a subtle 1px perimeter border.',
      snippet: clip(cardMatch[0]),
    });
  }

  // ── P0-6: Hardcoded Sans-Serif on Display Heading ──
  const sansDisplayMatch = DISPLAY_SANS_RE.exec(html);
  if (sansDisplayMatch) {
    findings.push({
      severity: 'P0',
      id: 'sans-display',
      message: 'Heading rule explicitly hardcodes Inter / Roboto / system-sans instead of using var(--font-display).',
      fix: 'Use `font-family: var(--font-display, inherit)` so the active typography contract governs heading choice.',
      snippet: clip(sansDisplayMatch[0]),
    });
  }

  // ── P0-7: Invented Metrics ──
  for (const pattern of INVENTED_METRIC_PATTERNS) {
    const m = pattern.exec(html);
    if (m) {
      findings.push({
        severity: 'P0',
        id: 'invented-metric',
        message: `Detected suspected invented metric claim: "${m[0]}".`,
        fix: 'Remove the unverified metric or use a labelled placeholder (—) until real data is supplied.',
        snippet: clip(m[0]),
      });
      break;
    }
  }

  // ── P0-8: Lorem / Filler Copy ──
  for (const pattern of FILLER_PATTERNS) {
    const m = pattern.exec(html);
    if (m) {
      findings.push({
        severity: 'P0',
        id: 'filler-copy',
        message: `Detected filler or dummy text: "${m[0]}".`,
        fix: 'Replace with specific copy derived from the prompt or context, or recompose without redundant sections.',
        snippet: clip(m[0]),
      });
      break;
    }
  }

  // ── P1-1: ALL CAPS without Letter-spacing Floor ──
  const upperCaseRegex = /(?:\{|\bstyle=["'][^"']*)([^;"'}]*text-transform\s*:\s*uppercase[^;"'}]*)/gi;
  let upperMatch: RegExpExecArray | null;
  while ((upperMatch = upperCaseRegex.exec(html)) !== null) {
    const block = upperMatch[1] || '';
    const hasTracking = /letter-spacing\s*:\s*(?:0\.(?:0[6-9]|[1-9]\d*)|[1-9]\d*(?:\.\d+)?px|[0-9.]+(?:em|rem))/i.test(block);
    if (!hasTracking) {
      findings.push({
        severity: 'P1',
        id: 'all-caps-no-tracking',
        message: 'ALL CAPS (text-transform: uppercase) found without sufficient letter-spacing (>= 0.06em).',
        fix: 'Add `letter-spacing: 0.08em` to prevent capital glyph collision.',
        snippet: clip(upperMatch[0]),
      });
      break;
    }
  }

  // ── P1-2: External Placeholder Image CDNs ──
  const extImageMatch = /<img[^>]+src=["']https?:\/\/(?:images\.unsplash\.com|placehold\.co|placekitten\.com|via\.placeholder\.com|picsum\.photos)/i.exec(html);
  if (extImageMatch) {
    findings.push({
      severity: 'P1',
      id: 'external-image',
      message: 'Fragile external placeholder image CDN URL detected.',
      fix: 'Use clean SVG placeholders or local asset references.',
      snippet: clip(extImageMatch[0]),
    });
  }

  // ── P1-3: Accent Overuse in Rendered Body ──
  const bodyWithoutStyles = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  const accentMatches = (bodyWithoutStyles.match(/var\((?:--accent|--dsw-alias-primary)\)/g) || []).length;
  if (accentMatches > 6) {
    findings.push({
      severity: 'P1',
      id: 'accent-overuse',
      message: `var(--accent) used ${accentMatches} times inline in the body — exceeds the recommended 2 visible uses per screen limit.`,
      fix: 'Cap accent targets at 2 per viewport (e.g. one badge + one primary CTA). Demote secondary items to neutral.',
    });
  }

  return findings;
}

/**
 * Lints social media copy for robotic AI cliches and excessive emoji density.
 */
export function lintSocialCopy(text: string): CraftLintFinding[] {
  const findings: CraftLintFinding[] = [];
  if (!text || typeof text !== 'string') return findings;

  // Cliché openings
  const clicheOpenings = [
    /在这个(?:飞速发展|日新月异|瞬息万变)的(?:数字化|AI|互联网)?时代/i,
    /正如我们(?:所见|所知|所说)/i,
    /众所周知/i,
    /毫无疑问/i,
  ];

  for (const re of clicheOpenings) {
    const m = re.exec(text);
    if (m) {
      findings.push({
        severity: 'P0',
        id: 'cliche-opening',
        message: `Detected AI cliché opening: "${m[0]}".`,
        fix: 'Cut the abstract lead-in and open directly with the core conflict, surprising fact, or personal narrative hook.',
        snippet: clip(m[0]),
      });
      break;
    }
  }

  // Cliché closings
  const clicheClosings = [
    /总而言之/i,
    /综上所述/i,
    /让我们一起开启这段旅程/i,
  ];

  for (const re of clicheClosings) {
    const m = re.exec(text);
    if (m) {
      findings.push({
        severity: 'P0',
        id: 'cliche-closing',
        message: `Detected AI cliché conclusion: "${m[0]}".`,
        fix: 'Replace formal robotic transitions with natural conversational call-to-actions.',
        snippet: clip(m[0]),
      });
      break;
    }
  }

  // Emoji density
  const emojiMatches = text.match(/[\p{Extended_Pictographic}]/gu) || [];
  const textLength = text.trim().length;
  if (textLength > 50 && emojiMatches.length / textLength > 0.05) {
    findings.push({
      severity: 'P1',
      id: 'emoji-density',
      message: `Emoji density is ${(emojiMatches.length / textLength * 100).toFixed(1)}% (over 5% limit). Looks spammy and synthetic.`,
      fix: 'Ration emojis to maximum 1-2 per section as visual anchors, not word replacements.',
    });
  }

  return findings;
}
