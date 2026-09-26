/**
 * 视频质量自动化验收器 (Video Quality Automated Evaluator)
 * 依据 5 大客观验收标准，通过 ffprobe 元数据 + Gemini 3.8 Flash 多模态视觉逐帧审计
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import yaml from 'yaml';

// 读取本地凭据
function resolveCpaKey() {
  const credPath = path.join(process.env.HOME, '.dsh/.credentials.yaml');
  if (fs.existsSync(credPath)) {
    const raw = fs.readFileSync(credPath, 'utf8');
    const parsed = yaml.parse(raw);
    return parsed?.refs?.CPA_API_KEY || process.env.CPA_API_KEY;
  }
  return process.env.CPA_API_KEY;
}

/**
 * 评估一个视频是否达到商用级社媒短视频预期标准
 * @param {string} videoPath 视频本地路径
 * @param {object} options 预期指标
 * @returns {Promise<{ pass: boolean, score: number, failures: string[], metadata: object, visualReport: string }>}
 */
export async function evaluateVideoQuality(videoPath, options = {}) {
  const { expectedRatio = '9:16', expectedMinDuration = 4, targetProduct = '5ml便携金属香水喷雾瓶' } = options;

  if (!fs.existsSync(videoPath)) {
    throw new Error(`视频文件不存在: ${videoPath}`);
  }

  // 1. 物理元数据硬指标检测 (ffprobe)
  const probeOut = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration,r_frame_rate -of json "${videoPath}"`
  ).toString();
  const probeData = JSON.parse(probeOut);
  const stream = probeData.streams[0];

  const width = Number(stream.width);
  const height = Number(stream.height);
  const duration = parseFloat(stream.duration);
  const ratio = height / width;

  const failures = [];

  // 严格检查竖屏高宽比 (9:16 约为 1.777)
  const isVertical = ratio >= 1.5;
  if (!isVertical) {
    failures.push(`画幅比例不合规: 当前分辨率为 ${width}x${height} (比例 ${ratio.toFixed(2)})，非 9:16 竖屏格式 (检测到严重黑边或方形 1:1)`);
  }

  if (duration < expectedMinDuration) {
    failures.push(`时长不足: 当前时长 ${duration.toFixed(1)}s 低于预期下限 ${expectedMinDuration}s`);
  }

  // 2. 抽取关键帧 (第 0 帧、中间帧、尾帧)
  const tmpDir = path.join('/tmp', `eval-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  execSync(`ffmpeg -y -i "${videoPath}" -vf "select=eq(n\\,0)+eq(n\\,30)+eq(n\\,60)+eq(n\\,90)+eq(n\\,120)" -vsync vfr "${tmpDir}/frame_%02d.jpg" 2>/dev/null`);

  const frameFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith('.jpg')).map(f => path.join(tmpDir, f));

  // 3. 多模态视觉质检 (Gemini 3.8 Flash)
  const apiKey = resolveCpaKey();
  if (!apiKey) {
    throw new Error('未配置 CPA_API_KEY，无法执行多模态视觉质检');
  }

  const framePayloads = frameFiles.slice(0, 3).map(fp => ({
    type: 'image_url',
    image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(fp).toString('base64')}` }
  }));

  const systemPrompt = `你是一位极其严苛的顶级社媒广告视觉质量与短视频合规审计官。
请对输入的视频前中后关键帧画面，严格依据以下【5大商用级标准】进行逐项审计：
1. 空间与物理环境一致性：严禁出现纯白底商品图向三维场景融化、液化、橡皮泥状拉伸变形；整个视频必须处于统一的三维真实物理空间中；
2. 真实产品外观还原度：画面中的核心道具是否呈现【${targetProduct}】的外观特征（金属磨砂质感外壳、小巧口红级尺寸、透明刻度视窗）；
3. 人物微表情与静默守卫：人物面部有无恐怖谷伪影，手部有无多指/粘连畸变；是否严格保持嘴唇自然闭合/微抿（严禁张嘴乱动口型，以保证与外部配音轨无缝契合）；
4. 画面质感与光影真实性：是否具备生活电影级光影质感，是否消除 3D 塑料廉价感；
5. 分镜动作因果逻辑：画面动作是否连贯合理。

输出必须严格为 JSON 格式：
{
  "pass": true | false,
  "overallScore": number (0-100, 85分以上为通过),
  "checklist": {
    "spatialCoherence": { "pass": boolean, "comment": "..." },
    "productFidelity": { "pass": boolean, "comment": "..." },
    "silentActingGuard": { "pass": boolean, "comment": "..." },
    "cinematicLighting": { "pass": boolean, "comment": "..." },
    "actionCausality": { "pass": boolean, "comment": "..." }
  },
  "criticalDefects": ["致命缺陷列表，无则为空"],
  "verdict": "一句话判定结论"
}`;

  const res = await fetch('http://127.0.0.1:8317/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gemini-3.8-flash-high',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: '请审计这 3 张视频关键帧（开场、中段、结尾）：' },
            ...framePayloads,
          ],
        },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  const resData = await res.json();
  const rawContent = resData.choices?.[0]?.message?.content || '{}';
  const cleanJson = rawContent.replace(/```json\n?|\n?```/g, '').trim();
  const auditResult = JSON.parse(cleanJson);

  if (auditResult.criticalDefects && auditResult.criticalDefects.length > 0) {
    failures.push(...auditResult.criticalDefects);
  }

  const pass = failures.length === 0 && auditResult.pass === true && auditResult.overallScore >= 85;

  return {
    pass,
    overallScore: auditResult.overallScore || 0,
    failures,
    metadata: { width, height, duration, ratio: ratio.toFixed(2) },
    checklist: auditResult.checklist || {},
    verdict: auditResult.verdict || '审计完成',
  };
}
