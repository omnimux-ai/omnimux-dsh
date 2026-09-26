/**
 * MiniMax H3 真实视频生成：全面采用成熟 Skill (viral-video-replication) 确认的完整分时段 Prompt
 * 并真正绑定真实产品参考图 (perfume-bottle-1733226176534972037-01.webp)
 */

import fs from 'fs';
import path from 'path';
import { executeOmnimuxVideo, pollVideoTask } from '../../../plugins/omnimux/src/media/video.js';

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

async function main() {
  console.log('================================================================');
  console.log('🎬 采用成熟 Skill 规范 + 真实产品参考图 执行 MiniMax H3 视频生成');
  console.log('================================================================\n');

  const apiKey = resolveCredentials();
  if (!apiKey) {
    console.error('❌ 未找到 OMNIMUX_API_KEY 凭据');
    process.exit(1);
  }

  // 1. 真实产品参考图 (来自 ~/.omnimux-dev/omnimux/products/media/)
  const productImgPath = '/Users/x/.omnimux-dev/omnimux/products/media/perfume-bottle-1733226176534972037-01.webp';
  if (!fs.existsSync(productImgPath)) {
    console.error(`❌ 产品参考图不存在: ${productImgPath}`);
    process.exit(1);
  }
  console.log(`🖼️ 成功绑定真实产品参考图: ${productImgPath}`);

  // 2. 由成熟技能 viral-video-replication 确认的完整专业 Prompt 结构
  const fullPrompt = `【素材参考绑定】
@图片1 作为主体参考（严格参考真实产品外观：口红大小便携金属磨砂小瓶，底部微孔自充装气阀，透明视窗刻度）。

【主体与场景基调】
法餐厅暖调光影，一位优雅年轻男士与对座女士的约会瞬间。从大牌整瓶笨重刺鼻的尴尬，到从容拿出口红大小的金属小瓶化解危机。真实生活电影感，反塑料感。

【分时段节拍与运镜】
0–3秒 (黄金 Hook · 亲密关系尴尬现场)：
  • 表演动作：餐桌前女生拆开沉重大香水礼盒，浓烈刺鼻面露强颜欢笑；手持微晃慢推
  • 镜头运镜：跟随镜头向前慢推 (Slow Push-in Track)，特写女生尴尬凝固的微表情
  • 微表情：极度期待到欲言又止的失望与强颜欢笑（全片禁止张嘴口播）
3–8秒 (动作因果 · 解药登场与分装示范)：
  • 表演动作：男生从西装口袋拿出 @图片1 样式的 5ml 极精致金属小管，单手对准大瓶微孔下压注水，液体迅速注满透明视窗刻度；微距极近景平移
  • 镜头运镜：微距平移 (Macro Slide)，紧贴液体快速上升的透明视窗刻度
  • 微表情：眼神从容笃定，嘴角微扬自信
8–13秒 (高光见证 · 芳心被俘与高转化定格)：
  • 表演动作：女生开心地接过来在手腕轻喷，细腻云雾散开；随手滑进口红迷你包，桌面定格三支不同质感小瓶
  • 镜头运镜：环绕平滑微退 (Slow Pull-out 30°)，定格至桌面三色陈列
  • 微表情：女生心花怒放，满眼甜蜜与惊艳

【硬性守卫】
• 人物全片始终禁止张嘴说话、禁止口播对白（嘴唇轻闭微抿，依靠眼神与肢体动作叙事）；
• 动作因果过渡平滑，避免突变与肢体畸变；
• 音效参考：餐具轻碰声 ➔ 沉重礼盒落地声 ➔ 金属开盖清脆声 ➔ 极细腻喷雾释放声。`;

  console.log(`\n📝 技能确认的完整分段分时 Prompt (字词级因果与守卫):\n----------------------------------------\n${fullPrompt}\n----------------------------------------\n`);

  // 3. 选用契合的分组与操作：first_frame (图生视频首帧驱动)，模型选用 minimax-h3 官方专线
  const model = 'minimax-h3';
  const outDir = path.resolve('tests/viral-eval-suite/artifacts');
  fs.mkdirSync(outDir, { recursive: true });
  const dest = path.join(outDir, `minimax-h3-with-reference-${Date.now()}.mp4`);

  console.log(`🎯 选用模型分组: 【${model}】(海螺官方专线，first_frame 首帧驱动)`);
  console.log(`⏳ 正在向网关提交任务并轮询...`);

  const startTime = Date.now();

  try {
    const result = await executeOmnimuxVideo({
      prompt: fullPrompt,
      model,
      operation: 'first_frame',
      references: [
        {
          role: 'first_frame',
          type: 'image',
          pathOrUrl: productImgPath,
        },
      ],
      duration: 5,
      resolution: '768P',
      aspectRatio: 'adaptive',
      dest,
      wait: false, // 异步提交
      env: { OMNIMUX_API_KEY: apiKey },
    });

    console.log(`✅ 任务提交成功！Task ID: ${result.taskId}`);
    console.log(`⏳ 正在轮询任务完成状态...`);

    const pollRes = await pollVideoTask({
      taskId: result.taskId,
      baseUrl: 'https://omnimux.ai',
      apiKey,
      capability: 'video',
    });

    console.log(`\n🎉 视频生成完成！`);
    const videoUrl = pollRes.outputs?.find(o => o.type === 'video')?.url || pollRes.url;
    console.log(`🌐 视频直链: ${videoUrl}`);

    if (videoUrl) {
      console.log(`📥 正在下载视频至: ${dest}`);
      const res = await fetch(videoUrl, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        throw new Error(`下载失败 HTTP ${res.status}: ${await res.text()}`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buffer);
      console.log(`📁 视频成功落盘！大小: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

      // 复制到主工作区便于 display_file 预览
      const mainDest = path.resolve('/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/tests/viral-eval-suite/artifacts/minimax-h3-with-reference-result.mp4');
      fs.mkdirSync(path.dirname(mainDest), { recursive: true });
      fs.writeFileSync(mainDest, buffer);
      console.log(`📁 已同步至主工作区: ${mainDest}`);
    }

  } catch (err) {
    console.error(`\n❌ 生成失败:`, err.message || err);
    if (err.cause) console.error('详情:', err.cause);
    process.exit(1);
  }
}

main().catch(console.error);
