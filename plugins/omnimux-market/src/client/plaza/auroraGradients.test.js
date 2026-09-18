import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AURORA_PRESETS, hashSeed, resolveSkillAuroraStyle } from './auroraGradients.js';

describe('Aurora Mesh Gradient Algorithm for Skill Cards', () => {
  it('AURORA_PRESETS contains 14 high-saturation fine-tuned presets', () => {
    assert.equal(AURORA_PRESETS.length, 14, '应该包含 14 套精调极光方案');
    AURORA_PRESETS.forEach((preset, index) => {
      assert.ok(preset.bg.includes('radial-gradient'), `预设 #${index} 必须包含高饱和度炫彩流光渐变`);
      assert.ok(preset.glow.startsWith('rgba('), `预设 #${index} 必须包含高亮霓虹光晕配置`);
    });
  });

  it('hashSeed produces deterministic positive integers', () => {
    const seed1 = hashSeed('sk-omx-ugc-confessional');
    const seed2 = hashSeed('sk-omx-ugc-confessional');
    assert.equal(seed1, seed2, '相同 skill 必须产生相同的随机种子');
    assert.ok(seed1 >= 0, '种子必须为非负整数');

    const seed3 = hashSeed('sk-omx-cinematic');
    assert.notEqual(seed1, seed3, '不同 skill 产生不同的种子');
  });

  it('resolveSkillAuroraStyle distributes different skills across distinct presets', () => {
    const testSkills = [
      { id: 'sk-1', title: 'UGC 告白' },
      { id: 'sk-2', title: '电影级' },
      { id: 'sk-3', title: 'UGC 展示' },
      { id: 'sk-4', title: '电子商贸' },
      { id: 'sk-5', title: '静态图片' },
      { id: 'sk-6', title: '轮播图' },
      { id: 'sk-7', title: 'TikTok 带货' },
      { id: 'sk-8', title: '亚马逊产品分析' },
      { id: 'sk-9', title: '短剧脚本' },
      { id: 'sk-10', title: 'AI 虚拟人' },
    ];

    const results = testSkills.map((skill) => resolveSkillAuroraStyle(skill));
    
    // 确保每个技能都返回有效的 bg 和 glow
    results.forEach((res, i) => {
      assert.ok(res.bg && res.bg.startsWith('radial-gradient'), `技能 #${i} 的背景必须是流光渐变`);
      assert.ok(res.glow && res.glow.startsWith('rgba'), `技能 #${i} 必须具备光晕色彩`);
    });

    // 确保在多种技能中命中了不同的视觉配色方案（随机分散分布）
    const uniqueBgCount = new Set(results.map((r) => r.bg)).size;
    assert.ok(uniqueBgCount >= 4, `10 个技能在 14 种预设中应至少覆盖 4 种以上不同配色，实际为: ${uniqueBgCount}`);
  });

  it('handles null/undefined/empty skill objects gracefully without crashing', () => {
    const emptyStyle = resolveSkillAuroraStyle({});
    assert.ok(emptyStyle && emptyStyle.bg, '空对象应安全返回默认流光样式');
    
    const nullStyle = resolveSkillAuroraStyle(null);
    assert.ok(nullStyle && nullStyle.bg, 'null 对象应安全返回默认流光样式');
  });
});
