/** Conservative admission: active canvas is context, never generation intent by itself. */
export function isExplicitGenerationRequest(text, { hasReference = false } = {}) {
  if (typeof text !== 'string') return false;
  const query = text.trim();
  if (!query || /^(?:停止|取消|别生成|不要生成|stop\b|cancel\b)/i.test(query)
    || /(?:不要|别|无需|不需要)(?:再)?(?:生成|画|制作|修改)/.test(query)
    || /(?:怎么|如何|为什么|是否|能否|能不能|可以吗|是什么|解释|分析|讨论|教程|how\s+(?:to|do)|explain)/i.test(query)) return false;
  const media = /(?:图片|图像|照片|海报|插画|视频|短片|动画|image|photo|picture|poster|video|clip)/i;
  const create = /(?:生成|画一|画个|绘制|制作|做一|做个|生图|生视频|重绘|generate|create|draw|render)/i;
  const edit = /(?:修改|改成|改为|换成|换为|替换|去掉|移除|删除|添加|调亮|调暗|修图|编辑|重绘|edit|replace|remove)/i;
  const promptWriting = /写[^\n。！？，]*提示词|(?:生成|优化|修改)(?:一段|一份|个|这段)?提示词|\b(?:write|draft)\b[^\n.!?]*\bprompt\b|\b(?:create|generate|improve|edit)\s+(?:(?:an?|the|some)\s+)?(?:(?:image|video|detailed|short|new)\s+)*prompts?\b/i;
  if (promptWriting.test(query) && !/(?:按|用|根据).+提示词.+(?:生成|画)/.test(query)) return false;
  return (create.test(query) && (media.test(query) || (hasReference && /场景|画面/.test(query)) || /(?:画一|画个|生图|生视频)/.test(query)))
    || (edit.test(query) && (media.test(query) || hasReference));
}
