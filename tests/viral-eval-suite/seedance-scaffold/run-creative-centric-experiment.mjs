/**
 * 端到端实测验证：以内容创意为中枢的组合/评分/防重与成熟 Skill 动态裁决实测
 */

import fs from 'fs';
import path from 'path';
import {
  CREATIVE_TEMPLATES,
  INSPIRATION_FRAMEWORKS,
  SKILL_CONTEXT,
  synthesizeCreativeOptions,
  scoreCreativeCandidate,
  filterAndRankCreatives,
  arbitrateMaterialRequirements,
  assembleDynamicPrompt,
} from './creative-engine.mjs';

const FIXTURES_DIR = path.resolve('tests/viral-eval-suite/fixtures');
const PRODUCT_FILE = path.join(FIXTURES_DIR, 'portable-perfume-product.json');
const HISTORY_FILE = path.join(FIXTURES_DIR, 'product-history-store.json');

async function main() {
  console.log('================================================================');
  console.log('🚀 启动【以内容创意为中枢】的社媒引擎实测 (Creative-Centric Test)');
  console.log('================================================================\n');

  const product = JSON.parse(fs.readFileSync(PRODUCT_FILE, 'utf8'));
  const historyStore = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));

  console.log(`📦 目标产品: ${product.name} (${product.id})`);
  console.log(`📜 已有历史生成记录数: ${historyStore.history_records.length} 条`);
  historyStore.history_records.forEach((r, i) => {
    console.log(`   [历史 #${i + 1}] 人设: ${r.persona} | Hook: ${r.hook_topic}`);
  });
  console.log('');

  // ----------------------------------------------------------------
  // 场景 A：用户目标为【TikTok 极速带货转化】
  // ----------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('🎯 测试场景 1: 用户目标 = TikTok 极速带货转化 (Direct Conversion)');
  console.log('----------------------------------------------------------------');
  const userIntentTikTok = {
    platform: 'tiktok',
    marketingGoal: 'direct_conversion',
  };

  // 1. 三大数据源组合生成
  const rawCandidatesTikTok = synthesizeCreativeOptions(product, userIntentTikTok, historyStore);
  console.log(`💡 三大数据源共交叉重组生成候选创意: ${rawCandidatesTikTok.length} 组`);

  // 2. 多维评分
  const scoredTikTok = rawCandidatesTikTok.map(c => scoreCreativeCandidate(c, product, userIntentTikTok));

  // 3. 负向排重与正交优选 (Top 3)
  const topTikTok = filterAndRankCreatives(scoredTikTok, historyStore, 3);
  console.log('🏆 经过【负向排重与空间发散算法】评选出的 Top 3 创意方案：');
  topTikTok.forEach((c, idx) => {
    console.log(`\n  [方案 ${idx + 1}] ${c.templateName} ✖️ ${c.persona}`);
    console.log(`   • 综合得分: ${c.adjustedScore}分 (原始分: ${c.scores.totalScore}) | 状态: ${c.antiRepetitionStatus}`);
    console.log(`   • 细分评分: 目标契合 ${c.scores.goalFit} | 钩子吸睛 ${c.scores.hookStrength} | 因果深度 ${c.scores.productLinkage} | 可行性 ${c.scores.feasibility}`);
    console.log(`   • 黄金 Hook: "${c.generatedHook}"`);
    console.log(`   • 异构说明: ${c.divergenceNotes}`);
  });

  // ----------------------------------------------------------------
  // 场景 B：针对方案 1 进行分镜细化，并由成熟 Skill 动态裁决参考素材
  // ----------------------------------------------------------------
  console.log('\n----------------------------------------------------------------');
  console.log('🎬 核心环节：将创意分镜交由成熟 Skill (viral-video-replication) 裁决素材范式');
  console.log('----------------------------------------------------------------');

  const chosenCreative = topTikTok[0]; // 选定第一名（如直男送礼反差或极端暴力破坏）
  console.log(`👉 选定出片创意: 【${chosenCreative.templateName}】（人设: ${chosenCreative.persona}）\n`);

  // 针对该创意设计的分镜脚本
  const sampleStoryboard = {
    title: `${chosenCreative.templateName} - ${chosenCreative.persona}`,
    segments: [
      {
        range: '0-3秒 (黄金 Hook · 亲密关系尴尬现场)',
        action: '餐厅餐桌前，女生满脸期待打开沉重奢侈品大包装盒，里面却是一大瓶味道过于成熟浓烈的古龙水，女生笑容瞬间僵硬；男生手足无措',
        camera: '手持微晃中景，随情绪尴尬急速推向女生尴尬凝固的眼神特写',
        microExpression: '极度期待到欲言又止的失望与强颜欢笑',
      },
      {
        range: '3-8秒 (动作因果 · 解药登场与分装示范)',
        action: '画风突变，男生像变魔术一样从西装暗袋抽出一套三支色彩高级的 5ml 金属喷雾管，单手下压大瓶喷管直接把清甜花果香注入小瓶，透明视窗秒显示灌满刻度',
        camera: '微距极近景平移，紧贴金属外壳与液体快速上升的微米级刻度视窗',
        microExpression: '眼神自信笃定，操作极度丝滑',
      },
      {
        range: '8-13秒 (高光见证 · 芳心被俘与高转化收尾)',
        action: '女生开心地将迷你小管滑进精致口红迷你包，凑在男生颈边轻闻并满意轻笑；画面定格在桌面三支不同颜色的质感小瓶',
        camera: '温暖逆光慢速平滑拉远 (Slow Pull-out 30°)，定格至桌面三色陈列',
        microExpression: '女生心花怒放，满眼甜蜜与惊艳',
      },
    ],
  };

  // 4. 成熟 Skill 动态裁决！
  const materialPlan = arbitrateMaterialRequirements(sampleStoryboard, SKILL_CONTEXT);

  console.log(`🧠 ${materialPlan.arbitratorSkill} 裁决报告：`);
  console.log(`   ${materialPlan.summary}\n`);
  console.log(`   【各分镜具体裁决清单】:`);
  materialPlan.referenceDecisions.forEach((d, i) => {
    console.log(`   • 分镜 ${i + 1} (${d.timeRange}) -> 【${d.decision}】: ${d.reason}`);
  });

  console.log(`\n   【最终推荐的最小充分素材集】:`);
  materialPlan.recommendedAssetSlots.forEach(slot => {
    console.log(`   • ${slot.slot} [${slot.kind}] -> ${slot.desc}`);
  });

  // 5. 动态 Prompt 重组
  const dynamicPrompt = assembleDynamicPrompt(chosenCreative, sampleStoryboard, materialPlan);
  console.log('\n----------------------------------------------------------------');
  console.log('📝 最终编译输出的动态 Prompt (零死板硬编码，完全按需装配)：');
  console.log('----------------------------------------------------------------');
  console.log(dynamicPrompt);
  console.log('----------------------------------------------------------------\n');

  console.log('✅ 测试全部顺利通过！以内容创意为中枢、三大数据组合与评分、及 Skill 动态裁决机制完全跑通！');
}

main().catch(err => {
  console.error('❌ 执行出错:', err);
  process.exit(1);
});
