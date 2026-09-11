import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeCraftSlugs,
  resolveCraftRequirements,
  loadCraftSections,
  formatCraftPromptSection,
  lintArtifact,
  lintSocialCopy,
} from '../src/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_DIR = path.resolve(__dirname, '../rules');

describe('Craft Prompt Assembler', () => {
  it('normalizes craft slugs and rejects invalid names', () => {
    const raw = ['typography', 'ANTI-AI-SLOP ', 'invalid_slug!', 'color', 'typography'];
    const normalized = normalizeCraftSlugs(raw);
    assert.deepEqual(normalized, ['typography', 'anti-ai-slop', 'color']);
  });

  it('injects invariant defaults for web-prototype', () => {
    const slugs = resolveCraftRequirements({ artifactKind: 'web-prototype' });
    assert.ok(slugs.includes('anti-ai-slop'));
    assert.ok(slugs.includes('typography'));
    assert.ok(slugs.includes('color'));
  });

  it('injects invariant defaults for deck', () => {
    const slugs = resolveCraftRequirements({ artifactKind: 'deck' });
    assert.ok(slugs.includes('typography'));
    assert.ok(slugs.includes('typography-hierarchy'));
    assert.ok(!slugs.includes('anti-ai-slop'));
  });

  it('respects exemptions', () => {
    const slugs = resolveCraftRequirements({
      artifactKind: 'web-prototype',
      exemptions: ['color'],
    });
    assert.ok(slugs.includes('anti-ai-slop'));
    assert.ok(slugs.includes('typography'));
    assert.ok(!slugs.includes('color'));
  });

  it('loads rule markdown and ignores missing files', async () => {
    const { body, sections } = await loadCraftSections(RULES_DIR, ['typography', 'non-existent-rule']);
    assert.deepEqual(sections, ['typography']);
    assert.ok(body.includes('### typography'));
    assert.ok(body.includes('CJK Leading'));
  });

  it('formats prompt section correctly', () => {
    const formatted = formatCraftPromptSection('### typography\nRules here');
    assert.ok(formatted.startsWith('## Active craft references'));
    assert.ok(formatted.includes('### typography'));
  });
});

describe('Deterministic Craft Linter', () => {
  it('flags P0 for default Tailwind indigo as accent', () => {
    const badHtml = `<button style="background: #6366f1; color: white;">Submit</button>`;
    const findings = lintArtifact(badHtml);
    assert.ok(findings.some((f) => f.id === 'ai-default-indigo' && f.severity === 'P0'));
  });

  it('does not flag token definitions for indigo', () => {
    const goodHtml = `<style>:root { --accent: #6366f1; }</style><button style="background: var(--accent);">Submit</button>`;
    const findings = lintArtifact(goodHtml);
    assert.ok(!findings.some((f) => f.id === 'ai-default-indigo'));
  });

  it('flags P0 for blue->cyan trust gradient', () => {
    const badHtml = `<div style="background: linear-gradient(90deg, #3b82f6, #06b6d4);">Hero</div>`;
    const findings = lintArtifact(badHtml);
    assert.ok(findings.some((f) => f.id === 'trust-gradient' && f.severity === 'P0'));
  });

  it('flags P0 for purple/violet gradient', () => {
    const badHtml = `<div style="background: linear-gradient(to right, #8b5cf6, #ec4899);">Hero</div>`;
    const findings = lintArtifact(badHtml);
    assert.ok(findings.some((f) => f.id === 'purple-gradient' && f.severity === 'P0'));
  });

  it('flags P0 for Emoji in button or heading', () => {
    const badHtml = `<button>Click here 🚀</button>`;
    const findings = lintArtifact(badHtml);
    assert.ok(findings.some((f) => f.id === 'emoji-icon' && f.severity === 'P0'));
  });

  it('flags P0 for rounded card with colored left border', () => {
    const badHtml = `<div style="border-radius: 8px; border-left: 4px solid red;">Card</div>`;
    const findings = lintArtifact(badHtml);
    assert.ok(findings.some((f) => f.id === 'left-accent-card' && f.severity === 'P0'));
  });

  it('flags P0 for invented metric', () => {
    const badHtml = `<h2>Our AI platform is 10× faster and guarantees 99.9% uptime</h2>`;
    const findings = lintArtifact(badHtml);
    assert.ok(findings.some((f) => f.id === 'invented-metric' && f.severity === 'P0'));
  });

  it('flags P0 for filler copy', () => {
    const badHtml = `<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>`;
    const findings = lintArtifact(badHtml);
    assert.ok(findings.some((f) => f.id === 'filler-copy' && f.severity === 'P0'));
  });

  it('flags P1 for uppercase text without tracking', () => {
    const badHtml = `<span style="text-transform: uppercase;">Category</span>`;
    const findings = lintArtifact(badHtml);
    assert.ok(findings.some((f) => f.id === 'all-caps-no-tracking' && f.severity === 'P1'));
  });

  it('passes clean crafted HTML with zero P0 errors', () => {
    const cleanHtml = `
      <style>
        .card { border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
        .label { text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; }
        .btn { background: var(--accent); color: var(--accent-fg); border-radius: 6px; }
      </style>
      <div class="card">
        <span class="label">Analytics</span>
        <h1>真实业务数据概览</h1>
        <p>基于当前账户昨日发布的 3 条短剧视频表现分析。</p>
        <button class="btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          查看明细
        </button>
      </div>
    `;
    const findings = lintArtifact(cleanHtml);
    const p0s = findings.filter((f) => f.severity === 'P0');
    assert.equal(p0s.length, 0);
  });

  it('flags social copy AI clichés', () => {
    const badCopy = '在这个飞速发展的数字化时代，视频营销正成为主流。总而言之，我们必须抓住机遇。';
    const findings = lintSocialCopy(badCopy);
    assert.ok(findings.some((f) => f.id === 'cliche-opening'));
    assert.ok(findings.some((f) => f.id === 'cliche-closing'));
  });

  it('passes authentic social copy', () => {
    const goodCopy = '实测了3种完播率最高的黄金前3秒分镜结构，反差镜头让跳出率直接降低42%。核心秘诀拆解在下方清单：';
    const findings = lintSocialCopy(goodCopy);
    assert.equal(findings.filter((f) => f.severity === 'P0').length, 0);
  });
});
