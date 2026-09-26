/**
 * 爆款短视频算法实验与自动化评测主执行器 (Run Experiment Harness)
 * 执行端到端：想法 ➔ 分类路由 ➔ 基因重组 ➔ 分镜/生图/生视频多模态生成 ➔ 自动化量化评测
 */

import { routeProductToArchetype } from './router.mjs';
import { recombineViralDna } from './recombinator.mjs';
import { generateFullVideoSpec } from './generator.mjs';
import { evaluateVideoSpec } from './evaluator.mjs';

// 准备两个高频典型赛道的真实产品测试用例
const TEST_CASES = [
  {
    id: 'prod_dtc_001',
    name: 'SwiftBlend 便携无线果汁杯',
    industry: '跨境DTC电商',
    keywords: ['榨汁机', '果汁杯', '便携', '小家电', '个护'],
    corePain: '蛋白粉冲不匀结块难以下咽、传统大搅拌机清洗巨麻烦',
    coreBenefit: '300W超强碎冰动力，10秒即出细腻奶昔，一键自清洗冲水即净',
    traditionalFlaw: '用勺子费劲搅拌或笨重大机器',
    severeConsequence: '满嘴粉疙瘩反胃想吐',
    audienceAngles: ['每天打卡健身的增肌白领', '早起通勤赶时间的断糖减脂党', '带娃出门手忙脚乱的年轻宝妈'],
  },
  {
    id: 'prod_saas_002',
    name: 'DocMorph AI 智能合同解构神器',
    industry: '出海SaaS工具',
    keywords: ['SaaS', 'AI工具', 'PDF', '合同解析', '代码', '生产力'],
    corePain: '每天手动录入几十份扫描件发票与冗长英文法务合同',
    coreBenefit: '一键拖拽扫描件，0.5秒精准提取结构化条款与异常风险',
    traditionalFlaw: '人工逐行肉眼核对敲键盘',
    severeConsequence: '连续加班到凌晨还漏看赔偿条款',
    audienceAngles: ['被繁琐发票折磨的中小企业财务', '处理跨国订单的涉外法务律师', '身兼数职的独立出海创业者'],
  },
];

console.log('================================================================');
console.log('🚀 OmniMux 短视频爆款算法评测实验室 (Viral Eval Harness) 启动');
console.log('================================================================\n');

const experimentResults = [];

for (const product of TEST_CASES) {
  console.log(`\n📦 正在测试产品: [${product.name}] (所属行业: ${product.industry})`);
  
  // 1. 场景分类与收敛路由
  const route = routeProductToArchetype(product);
  console.log(`🎯 命中场景路由器: [${route.name}]`);

  // 2. 模拟同一产品进行 3 次不同爆款变体的交叉重组
  for (let varIdx = 0; varIdx < 3; varIdx++) {
    const recombined = recombineViralDna(product, route, varIdx);
    const videoSpec = generateFullVideoSpec(product, recombined);
    const evalResult = evaluateVideoSpec(videoSpec, product);

    experimentResults.push({
      product: product.name,
      variation: `变体 #${varIdx + 1} (${recombined.chosenAngle})`,
      route: route.name,
      hookType: recombined.assembledDna.hook.type,
      deliveryType: recombined.assembledDna.delivery.type,
      ctaType: recombined.assembledDna.cta.type,
      evalResult,
      sampleDialogueHook: videoSpec.storyboard[0].dialogue,
      sampleI2VExcerpt: videoSpec.i2vMotionPrompt.split('\n')[1],
    });
  }
}

console.log('\n================================================================');
console.log('📊 算法评测结果汇总报表 (Experiment Summary Table)');
console.log('================================================================\n');

experimentResults.forEach((res, i) => {
  console.log(`[测试序列 #${i + 1}] ${res.product} ➔ ${res.variation}`);
  console.log(`  - 基因组合: Hook【${res.hookType}】 + 论证【${res.deliveryType}】 + CTA【${res.ctaType}】`);
  console.log(`  - 首秒台词Hook: "${res.sampleDialogueHook}"`);
  console.log(`  - I2V动作指令: "${res.sampleI2VExcerpt}"`);
  console.log(`  - 评测得分: ${res.evalResult.totalScore}/100 [${res.evalResult.isPassed ? '✅ 达标' : '❌ 未达标'}]`);
  console.log(`  - 子项评分: Hook: ${res.evalResult.subScores.hookRetention} | 节奏: ${res.evalResult.subScores.pacingDensity} | I2V可演度: ${res.evalResult.subScores.i2vExecutability} | 事实安全: ${res.evalResult.subScores.factSafety}`);
  console.log(`  - 状态反馈: ${res.evalResult.feedback.join('; ')}\n`);
});

const passRate = (experimentResults.filter(r => r.evalResult.isPassed).length / experimentResults.length) * 100;
console.log(`📈 整体实验达标率: ${passRate.toFixed(1)}%`);
console.log('================================================================\n');
