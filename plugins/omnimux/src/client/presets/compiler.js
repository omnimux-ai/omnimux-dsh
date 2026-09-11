/**
 * 营销视频创意预设 Prompt 编译器
 * 纯函数：将选中的广告格式、亮点/Hook、视觉风格与用户输入整合成工业级结构化指令
 */

/**
 * @typedef {Object} PresetCompileOptions
 * @property {import('./catalog.js').CREATIVE_VIDEO_FORMATS[0]} [format] 广告格式
 * @property {import('./catalog.js').CREATIVE_HOOKS[0]} [hook] 亮点/Hook
 * @property {import('./catalog.js').CREATIVE_VISUAL_STYLES[0]} [style] 视觉风格
 * @property {string} [userQuery] 用户原始产品卖点或创意输入
 * @property {'zh-CN' | 'en-US'} [language] 语言倾向，默认 'zh-CN'
 */

/**
 * 编译创意预设与用户输入为结构化 Prompt
 * @param {PresetCompileOptions} options
 * @returns {string}
 */
export function compileCreativePrompt(options = {}) {
  const { format, hook, style, userQuery = '', language = 'zh-CN' } = options

  const isZh = language === 'zh-CN'
  const sections = []

  // 1. 系统角色与导演指令头
  if (isZh) {
    sections.push(
      '【营销视频创意指令 · 工业级分镜与视听规范】\n' +
      '你是一位资深短视频商业导演与 AI 视频生成大师。请根据以下指定的结构化创意框架、黄金开场抓手及视觉风格，将目标产品/主题进行专业分镜拆解与 Prompt 生成。'
    )
  } else {
    sections.push(
      '[CREATIVE DIRECTIVE · CINEMATIC COMMERCIAL PRODUCTION]\n' +
      'You are an expert commercial video director and AI video generator. Synthesize the target subject into structured scene shots and keyframe prompts according to the creative blueprint below.'
    )
  }

  // 2. 叙事格式与分镜骨架 (Format)
  if (format) {
    const title = format.titleZh ? `${format.titleZh} (${format.title})` : format.title
    const category = format.categoryNameZh ? `${format.categoryNameZh} (${format.categoryName})` : format.categoryName
    if (isZh) {
      sections.push(
        `### 一、 叙事格式与节奏骨架 (Video Format: ${title})\n` +
        `- 分类定位: ${category}\n` +
        (format.description ? `- 核心概念: ${format.description}\n` : '') +
        (format.prompt ? `- 分镜框架结构:\n${format.prompt.trim()}\n` : '')
      )
    } else {
      sections.push(
        `### 1. NARRATIVE SKELETON & TIMELINE (Format: ${format.title})\n` +
        `- Category: ${format.categoryName}\n` +
        (format.description ? `- Core Concept: ${format.description}\n` : '') +
        (format.prompt ? `- Shot Structure:\n${format.prompt.trim()}\n` : '')
      )
    }
  }

  // 3. 黄金前3秒抓手 (Hook)
  if (hook) {
    const title = hook.titleZh ? `${hook.titleZh} (${hook.title})` : hook.title
    const category = hook.categoryNameZh ? `${hook.categoryNameZh} (${hook.categoryName})` : hook.categoryName
    if (isZh) {
      sections.push(
        `### 二、 黄金前 3 秒吸睛抓手 (Attention Hook: ${title}) [优先级: 最高]\n` +
        `- 抓手类型: ${category}\n` +
        (hook.description ? `- 效果目标: ${hook.description}\n` : '') +
        (hook.prompt ? `- 视听与节奏执行指令:\n${hook.prompt.trim()}\n` : '') +
        `- 强制要求: 视频第 0-3 秒必须严格触发上述开场冲突与音效，强力截留用户注意。`
      )
    } else {
      sections.push(
        `### 2. FIRST 3-SECOND HOOK (Attention Retention: ${hook.title}) [PRIORITY: IMMEDIATE]\n` +
        `- Hook Type: ${hook.categoryName}\n` +
        (hook.description ? `- Goal: ${hook.description}\n` : '') +
        (hook.prompt ? `- Execution Directives:\n${hook.prompt.trim()}\n` : '') +
        `- Requirement: Strictly execute the visual hook in seconds 0-3 to maximize viewer retention.`
      )
    }
  }

  // 4. 视觉美学与光影色调 (Visual Style)
  if (style) {
    const title = style.titleZh ? `${style.titleZh} (${style.title})` : style.title
    const category = style.categoryNameZh ? `${style.categoryNameZh} (${style.categoryName})` : style.categoryName
    if (isZh) {
      sections.push(
        `### 三、 视觉美学与光影镜头 (Visual Style: ${title})\n` +
        `- 美学体系: ${category}\n` +
        (style.description ? `- 风格调性: ${style.description}\n` : '') +
        (style.prompt ? `- 摄影与光影规范:\n${style.prompt.trim()}\n` : '') +
        `- 强制要求: 所有分镜需保持统一的色温、质感与光影，严禁不同镜头出现风格撕裂。`
      )
    } else {
      sections.push(
        `### 3. CINEMATOGRAPHY & VISUAL STYLE (Style: ${style.title})\n` +
        `- Aesthetic System: ${style.categoryName}\n` +
        (style.description ? `- Tone: ${style.description}\n` : '') +
        (style.prompt ? `- Lighting & Camera Spec:\n${style.prompt.trim()}\n` : '') +
        `- Requirement: Maintain strict visual consistency in lighting, color grading, and lens texture across all shots.`
      )
    }
  }

  // 5. 目标商品与用户原始诉求 (Subject / Target)
  const cleanQuery = typeof userQuery === 'string' ? userQuery.trim() : ''
  if (cleanQuery) {
    if (isZh) {
      sections.push(
        `### 四、 核心推广商品与卖点需求 (Product Target)\n` +
        `${cleanQuery}`
      )
    } else {
      sections.push(
        `### 4. TARGET PRODUCT & CORE PROPOSITION\n` +
        `${cleanQuery}`
      )
    }
  }

  // 6. 最终输出交付物指引
  if (isZh) {
    sections.push(
      '【交付要求】:\n' +
      '1. 输出 3-5 个具体分镜（含景别、时长、运镜、画面内容、解说词/音效）；\n' +
      '2. 每个分镜必须提供可直接喂给视频生成模型的英文 Prompt（含 Positive Prompt 与 Camera Motion）；\n' +
      '3. 开场前 3 秒严格融合所选 Hook，全片呈现所选视觉美学。'
    )
  } else {
    sections.push(
      '[OUTPUT SPECIFICATION]:\n' +
      '1. Provide 3-5 concrete shots (shot size, duration, camera movement, visual action, VO/SFX);\n' +
      '2. Provide English generative prompts for each shot, including camera motion parameters;\n' +
      '3. Strictly apply the hook in shot 1 and maintain the specified aesthetic tone throughout.'
    )
  }

  return sections.join('\n\n')
}
