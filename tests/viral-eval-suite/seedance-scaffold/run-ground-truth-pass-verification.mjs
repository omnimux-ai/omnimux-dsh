/**
 * 闭环验证执行器：根据 5 大客观验收标准，运行 MiniMax H3 生成并执行自动视觉审计
 * 目标：实现 9:16 竖屏、真实产品微距细节、空间稳定无融化、严格静默守卫的全闭环通过 (PASS)
 */

import fs from 'fs';
import path from 'path';
import { executeOmnimuxVideo, pollVideoTask } from '../../../plugins/omnimux/src/media/video.js';
import { evaluateVideoQuality } from './video-evaluator.mjs';

function resolveCredentials() {
  const credPath = path.join(process.env.HOME, '.dsh/.credentials.yaml');
  let apiKey = process.env.OMNIMUX_API_KEY;
  if (!apiKey && fs.existsSync(credPath)) {
    const raw = fs.readFileSync(credPath, 'utf8');
    const match = raw.match(/OMNIMUX_API_KEY:\s*["']?([^"'\r\n]+)["']?/);
    if (match && match[1]) {
      apiKey = match[1].trim();
    }
  }
  return apiKey;
}

async function runVerificationLoop() {
  console.log('================================================================');
  console.log('🎯 启动短视频质量闭环验收实测 (Quality Gate Loop)');
  console.log('================================================================\n');

  const apiKey = resolveCredentials();
  if (!apiKey) {
    throw new Error('未找到 OMNIMUX_API_KEY');
  }

  // 1. 严格针对 5 大验收标准定制的高画质 9:16 竖屏专业 Prompt
  const prompt = `电影级画质，9:16竖屏，优雅法餐厅暖金烛光与景深虚化背景。极近景微距平移镜头（Macro Slide Track），核心焦点是一支极其精致小巧的口红大小银色磨砂金属便携香水瓶，瓶身竖向透明细长视窗内淡金黄色香水液体折射着温暖光泽。一只男士修长干净的手指从容轻压喷头，极其细腻均匀的微米级香水雾气在逆光中喷涌弥散成唯美光晕。镜头随后平滑拉远（Slow Pull-out），对座一位身着优雅晚礼服的年轻女士面露惊喜甜美笑容，眼神充满赞赏，嘴唇自然轻闭微笑（人物全程严禁张嘴说话，严禁露齿对白）。画质真实自然，反3D塑料感，8k超清摄影，光影连贯稳定。`;

  const model = 'minimax-h3@video_pro';
  const outDir = path.resolve('tests/viral-eval-suite/artifacts');
  fs.mkdirSync(outDir, { recursive: true });
  const dest = path.join(outDir, `minimax-h3-verified-pass-${Date.now()}.mp4`);

  console.log(`📐 设定严格物理契约: 比例 9:16 竖屏 | 分辨率 768P | 模型 minimax-h3@video_pro`);
  console.log(`📝 注入抗断层、防张嘴、强产品特征提示词 (Prompt):`);
  console.log(`   "${prompt}"\n`);
  console.log(`⏳ 提交任务并轮询...`);

  // 2. 提交真实生成任务
  const submitRes = await executeOmnimuxVideo({
    prompt,
    model,
    operation: 'text_to_video',
    duration: 5,
    resolution: '768P',
    aspectRatio: '9:16', // 强制指定 9:16 竖屏！
    dest,
    wait: false,
    env: { OMNIMUX_API_KEY: apiKey },
  });

  console.log(`✅ 任务提交成功！Task ID: ${submitRes.taskId}`);
  console.log(`⏳ 正在轮询渲染状态... (预计 45~90 秒)`);

  const pollRes = await pollVideoTask({
    taskId: submitRes.taskId,
    baseUrl: 'https://omnimux.ai',
    apiKey,
    capability: 'video',
  });

  const videoUrl = pollRes.outputs?.find(o => o.type === 'video')?.url || pollRes.url;
  console.log(`\n🎉 视频渲染完成！直链: ${videoUrl}`);

  // 下载视频
  console.log(`📥 正在下载成品视频至: ${dest}`);
  const res = await fetch(videoUrl, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`下载失败 HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
  console.log(`📁 视频下载成功！大小: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

  // 同步到主工作区
  const mainDest = path.resolve('/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/tests/viral-eval-suite/artifacts/minimax-h3-verified-pass.mp4');
  fs.writeFileSync(mainDest, buffer);

  // 3. 启动自动化 5 维客观质量验收！
  console.log('\n----------------------------------------------------------------');
  console.log('🔍 启动自动化视觉多模态质量验收审计 (ffprobe + Gemini 3.8 Flash)');
  console.log('----------------------------------------------------------------');

  const auditResult = await evaluateVideoQuality(dest, {
    expectedRatio: '9:16',
    expectedMinDuration: 5,
    targetProduct: '5ml口红级便携银色磨砂金属香水喷雾瓶（带透明细长刻度视窗）',
  });

  console.log(`\n📊 最终质检报告:`);
  console.log(`   • 最终裁决: ${auditResult.pass ? '✅ 验收通过 (PASS)' : '❌ 验收未通过 (FAIL)'}`);
  console.log(`   • 综合得分: ${auditResult.overallScore} / 100 分 (合格门禁 >= 85分)`);
  console.log(`   • 视频分辨率: ${auditResult.metadata.width}x${auditResult.metadata.height} (高宽比: ${auditResult.metadata.ratio})`);
  console.log(`   • 视频时长: ${auditResult.metadata.duration.toFixed(2)} 秒`);
  console.log(`   • 一句话结论: ${auditResult.verdict}`);
  console.log(`\n   【5 大维度逐项核验结果】:`);
  for (const [k, v] of Object.entries(auditResult.checklist)) {
    console.log(`   • ${k}: ${v.pass ? '✅ PASS' : '❌ FAIL'} - ${v.comment}`);
  }

  if (auditResult.failures.length > 0) {
    console.log(`\n   ⚠️ 发现缺陷列表:`);
    auditResult.failures.forEach(f => console.log(`     - ${f}`));
  }

  return {
    dest,
    mainDest,
    auditResult,
  };
}

runVerificationLoop().catch(err => {
  console.error('❌ 执行失败:', err);
  process.exit(1);
});
