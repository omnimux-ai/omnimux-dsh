import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const coversHomeDir = join(root, 'plugins/omnimux-market/catalog/covers/home')
const catalogPath = join(root, 'plugins/omnimux-market/catalog/index.json')
mkdirSync(coversHomeDir, { recursive: true })

const apiKey = process.argv[2]
if (!apiKey) {
  console.error("Missing apiKey argument!")
  process.exit(1)
}

const SKILL_PROMPTS = [
  {
    id: "sk-tiktok-market-trend-analysis",
    slug: "tiktok-market-trend-analysis",
    title: "TikTok 市场趋势分析",
    prompt: "[Subject & Action] A cinematic visualization of TikTok Shop global market trend analysis: a luminous holographic 3D globe surrounded by floating trend charts, rising sales volume velocity bars, viral product category rank badges, and glowing upward trajectory curves. [Style & Aesthetics] Futuristic fintech and social commerce aesthetic, photorealistic 3D render, frosted acrylic cards, sleek obsidian desk, vibrant neon cyan, electric violet, and warm amber accents, Octane render, ray-tracing. [Lighting & Atmosphere] Dynamic neon rim lighting, cool ambient studio backlight, volumetric atmospheric dust, high contrast, clean premium feel. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, centered balanced composition, clean modern studio background, masterwork, 8k resolution, no text, no gibberish letters, no watermark."
  },
  {
    id: "sk-tiktok-product-selection",
    slug: "tiktok-product-selection",
    title: "TikTok 选品",
    prompt: "[Subject & Action] A pristine 3D scene of viral TikTok Shop product selection: an illuminated translucent pedestal showcasing floating top-selling consumer gadgets, glowing score rating badges, golden analytical spark particles, and algorithmic product comparison matrices. [Style & Aesthetics] Premium commercial 3D render, frosted glass display cases, polished titanium, pastel mint green and rich magenta neon illumination, raytraced refractions. [Lighting & Atmosphere] Studio product lighting with soft shadows, radiant ambient glow, crisp highlights on glass edges. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, central focus, spacious clean background, no text, no watermark, masterwork quality."
  },
  {
    id: "sk-tiktok-material-breakdown",
    slug: "tiktok-material-breakdown",
    title: "TikTok 素材拆解",
    prompt: "[Subject & Action] A futuristic digital video editor's workstation dissecting TikTok viral video materials: floating 3D holographic video film frames broken down layer by layer, glowing hook timing markers, visual CTA burst icons, and segmented soundwave audio tracks. [Style & Aesthetics] Cybernetic studio aesthetic, translucent holographic screens, matte dark slate surfaces, electric turquoise and neon coral laser accents, Octane 3D render. [Lighting & Atmosphere] Volumetric light shafts, glowing screen reflections, dramatic moody atmosphere. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, centered balanced layout, 8k resolution, no text, no gibberish characters, no watermark."
  },
  {
    id: "sk-tiktok-script-creation",
    slug: "tiktok-script-creation",
    title: "TikTok 脚本创作",
    prompt: "[Subject & Action] A creative scriptwriting concept scene: an illuminated transparent glass script clipboard floating above a creator desk, glowing storyline storyboard cards, audio microphone icon, soundwave particles, and radiant spark bursts of creative inspiration. [Style & Aesthetics] Modern cinematic 3D render, frosted crystal glass, brushed aluminum, warm sunset gold and lavender neon glows, ray-tracing, elegant studio setting. [Lighting & Atmosphere] Warm golden key light, soft purple ambient rim lighting, gentle cinematic bokeh. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, central hero composition, clean minimalist background, no text, no watermark."
  },
  {
    id: "sk-html-report-templates",
    slug: "html-report-templates",
    title: "HTML 报表模板",
    prompt: "[Subject & Action] A high-tech digital workspace with modular dashboard reporting templates: clean floating glass panels displaying structured data layouts, KPI stat widgets, interactive chart blocks, and organized executive report sheets. [Style & Aesthetics] Elegant Bauhaus-inspired tech minimalism, matte white and deep slate gray materials, electric cobalt blue and emerald accents, crisp geometry, photorealistic 3D Octane render. [Lighting & Atmosphere] Balanced studio illumination, subtle shadows, crisp reflections on glass edges. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, symmetric clean layout, ample negative space, no text, no words, no watermark."
  },
  {
    id: "sk-shopee-market-analysis",
    slug: "shopee-market-analysis",
    title: "Shopee 市场分析",
    prompt: "[Subject & Action] A vibrant Southeast Asian cross-border ecommerce market analysis concept: an isometric 3D landscape of digital islands representing marketplace sites, connected by luminous sea-route trade lines, floating product category radar charts, and glowing opportunity flags. [Style & Aesthetics] Stylized low-poly meets hyper-detailed 3D render, translucent orange and tropical cyan acrylic materials, smooth ceramic textures, Octane ray-tracing. [Lighting & Atmosphere] Warm tropical golden hour lighting, soft ambient fill, radiant glowing data streams. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, centered composition, clean studio backdrop, no text, no watermark."
  },
  {
    id: "sk-shopee-product-analysis",
    slug: "shopee-product-analysis",
    title: "Shopee 商品分析",
    prompt: "[Subject & Action] A high-precision ecommerce product intelligence scene: floating transparent product cards showing 3D wireframe consumer goods, surrounding sales velocity graphs, search rank badges, and glowing tag ribbons. [Style & Aesthetics] Modern commercial product visualization, polished glass display podiums, matte porcelain, radiant Shopee orange and deep navy accents, photorealistic ray-tracing. [Lighting & Atmosphere] Crisp studio product illumination, soft ambient glows, elegant reflections. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, central focal point, clean composition, no text, no watermark."
  },
  {
    id: "sk-shopee-shop-analysis",
    slug: "shopee-shop-analysis",
    title: "Shopee 店铺分析",
    prompt: "[Subject & Action] An architectural visualization of digital storefront analysis: a stylized glass miniature store pavilion surrounded by floating assortment mix rings, brand share pie charts, and customer traffic light trails. [Style & Aesthetics] Contemporary architectural 3D render, frosted acrylic walls, warm timber bases, glowing orange and sapphire accent beams, Octane render. [Lighting & Atmosphere] Cozy interior warm glow combined with modern architectural studio lighting. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, centered hero perspective, no text, no watermark."
  },
  {
    id: "sk-shopee-brand-analysis",
    slug: "shopee-brand-analysis",
    title: "Shopee 品牌分析",
    prompt: "[Subject & Action] A prestigious brand performance intelligence showcase: a golden laurel emblem resting on a tiered marble pedestal, surrounded by holographic brand equity index rings and multi-site distribution pillar graphs. [Style & Aesthetics] Luxury commercial 3D render, white Carrara marble, polished brass, champagne gold and deep obsidian tones, hyper-detailed ray-tracing. [Lighting & Atmosphere] Dramatic top-down spot lighting, metallic specular highlights, premium editorial feel. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, centered majestic composition, no text, no watermark."
  },
  {
    id: "sk-shopee-keyword-analysis",
    slug: "shopee-keyword-analysis",
    title: "Shopee 关键词分析",
    prompt: "[Subject & Action] A search volume and keyword discovery matrix: a glowing search lens hovering above a field of floating illuminated keyword spheres of varying sizes, connected by radiant search trend curves and related product link vectors. [Style & Aesthetics] Abstract information visualization, translucent crystal bubbles, vibrant orange and electric violet energy threads, sleek dark pedestal. [Lighting & Atmosphere] Radiant self-illuminated nodes, glowing particle trails, atmospheric dark background. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, balanced spatial depth, no text, no watermark."
  },
  {
    id: "sk-video-generate-canvas",
    slug: "video-generate-canvas",
    title: "视频生成画布",
    prompt: "[Subject & Action] An infinite digital creative canvas workstation: floating nodes representing video generation, text prompts, image keyframes, and motion tracks connected by luminous golden spline curves, glowing preview windows showing abstract cinematic landscape footage. [Style & Aesthetics] Sleek creative software universe, dark glassmorphism, iridescent gradient glowing cables, deep cosmic indigo and electric violet studio environment, Octane render. [Lighting & Atmosphere] Brilliant glowing node pulses, volumetric fog, high-contrast cinematic mood. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, expansive canvas perspective, clean composition, no text, no watermark."
  },
  {
    id: "sk-ecommerce-routing-policy",
    slug: "ecommerce-routing-policy",
    title: "电商路由策略",
    prompt: "[Subject & Action] An intelligent routing and policy nexus: a central glowing prism core routing colored data streams into distinct operational agent channels, surrounded by floating logic gate rings and automated workflow tracks. [Style & Aesthetics] Futuristic algorithmic data hub, polished obsidian and frosted quartz, laser-sharp light paths in gold, cyan, and emerald, raytraced refractions. [Lighting & Atmosphere] Vivid luminescent fiber-optic glow, dark minimalist cyber-studio setting. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, radial symmetrical composition, no text, no watermark."
  },
  {
    id: "sk-ecommerce-output-spec",
    slug: "ecommerce-output-spec",
    title: "电商输出规范",
    prompt: "[Subject & Action] Standardized file and report output delivery: a set of perfectly aligned translucent document dossiers and report capsules resting on an inspection podium, with precision measurement grid lines, green verification checkmarks, and data export icons. [Style & Aesthetics] High-precision Swiss design aesthetic in 3D, matte polymers, frosted crystal, crisp monochromatic surfaces with subtle emerald green success glows, Octane render. [Lighting & Atmosphere] Even softbox lighting, ultra-clean studio background, pristine shadows. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, clean structured layout, no text, no watermark."
  },
  {
    id: "sk-ecommerce-daily-review",
    slug: "ecommerce-daily-review",
    title: "电商日报复盘",
    prompt: "[Subject & Action] A strategic ecommerce daily and weekly review command desk: an elegant curved executive monitor display featuring multi-channel performance radar, sales review timeline calendars, and diagnostic health score gauges. [Style & Aesthetics] Modern executive operations room, dark walnut desk, brushed titanium trim, soft ambient golden glow and deep navy lighting, photorealistic 3D render. [Lighting & Atmosphere] Warm architectural desk lamp glow paired with subtle screen luminescence, calm professional atmosphere. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, wide panoramic view, no text, no watermark."
  },
  {
    id: "sk-amazon-market-analysis",
    slug: "amazon-market-analysis",
    title: "亚马逊市场分析",
    prompt: "[Subject & Action] Amazon category and market opportunity discovery: a grand architectural 3D atrium with soaring data pillars representing product categories, floating market size spheres, and ascending opportunity arrows. [Style & Aesthetics] Monumental data architecture, matte white marble, brushed bronze accents, deep slate blue ambient lighting, Octane render. [Lighting & Atmosphere] Dramatic celestial light beam from above, soft ambient fill, dignified corporate atmosphere. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, epic perspective with clear central focus, no text, no watermark."
  },
  {
    id: "sk-amazon-product-analysis",
    slug: "amazon-product-analysis",
    title: "亚马逊产品分析",
    prompt: "[Subject & Action] Deep Amazon ASIN and competitor product dissection: an illuminated high-tech inspection platform with a floating product bounding cube, surrounded by competitor comparison telemetry rings and attribute breakdown prisms. [Style & Aesthetics] Advanced industrial design laboratory, matte black anodized aluminum, glowing amber and cyan laser grids, crystal clear optical lenses. [Lighting & Atmosphere] Sharp technical spotlights, subtle haze, high-contrast studio environment. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, centered hero focus, no text, no watermark."
  },
  {
    id: "sk-amazon-listing-optimization",
    slug: "amazon-listing-optimization",
    title: "亚马逊 Listing 优化",
    prompt: "[Subject & Action] Amazon listing and A+ content visual architecture: floating modular A+ story cards displaying product lifestyle imagery layout modules, keyword density heatmaps, and golden conversion rate stars. [Style & Aesthetics] Premium brand merchandising studio, elegant ivory and champagne gold palette, frosted glass layout grids, clean modern luxury feel. [Lighting & Atmosphere] Flattering soft studio portrait illumination, warm specular reflections. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, clean editorial arrangement, no text, no watermark."
  },
  {
    id: "sk-amazon-keyword-traffic-analysis",
    slug: "amazon-keyword-traffic-analysis",
    title: "亚马逊关键词流量分析",
    prompt: "[Subject & Action] Amazon PPC search traffic and ABA trend dynamics: glowing river-like streams of search volume flowing into a funnel, with keyword ranking elevation waves and PPC cost-per-click optimization spheres. [Style & Aesthetics] Fluid data visualization, luminescent glass ribbons, amber and rich violet fluids, dark reflective infinity floor. [Lighting & Atmosphere] Vibrant self-emitting light waves, high-energy particle glow, dark atmospheric backdrop. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, dynamic horizontal flow, no text, no watermark."
  },
  {
    id: "sk-amazon-review-optimization",
    slug: "amazon-review-optimization",
    title: "亚马逊评论优化",
    prompt: "[Subject & Action] Amazon customer VOC and review sentiment transformation: customer feedback cards with star badges passing through an AI filter lens, converting raw user feedback into glowing golden feature improvement gems. [Style & Aesthetics] Conceptual 3D metaphorical art, polished amber crystal, frosted glass prisms, clean matte pedestal, Octane ray-tracing. [Lighting & Atmosphere] Warm golden refraction lights, soft cinematic glow, uplifting atmosphere. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, centered storytelling composition, no text, no watermark."
  },
  {
    id: "sk-amazon-trend-risk-monitor",
    slug: "amazon-trend-risk-monitor",
    title: "亚马逊趋势风险监控",
    prompt: "[Subject & Action] Amazon BSR trend and trademark risk monitoring sentinel: a sleek holographic radar shield scanning a 3D terrain of sales rank peaks and valleys, with protective green security forcefields detecting risk anomalies. [Style & Aesthetics] Cyber-security meets fintech, dark obsidian command pedestal, holographic emerald shield with warning amber telemetry lines, Octane render. [Lighting & Atmosphere] Vivid luminescent security glow, dramatic low-key studio lighting. [Composition & Constraints] Widescreen 16:9 landscape aspect ratio, strong protective central motif, no text, no watermark."
  }
]

const baseUrl = "https://api.omnimux.ai/v1/images/generations"

async function submitTask(prompt) {
  const resp = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    },
    body: JSON.stringify({
      model: "gpt-image-2.5",
      prompt,
      size: "1536x1024",
      quality: "high",
      n: 1
    })
  })
  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Submit failed HTTP ${resp.status}: ${errText}`)
  }
  const data = await resp.json()
  return data.id || data.task_id || data.data?.task_id
}

async function pollTask(taskId) {
  const url = `${baseUrl}/${taskId}`
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const resp = await fetch(url, {
      headers: { "Authorization": "Bearer " + apiKey }
    })
    if (!resp.ok) continue
    const json = await resp.json()
    const status = json.data?.status || json.status
    if (status === "succeeded" || status === "success" || status === "completed") {
      return json.data?.url || json.url || json.data?.[0]?.url
    }
    if (status === "failed" || status === "error") {
      throw new Error(`Task ${taskId} failed: ${JSON.stringify(json)}`)
    }
  }
  throw new Error(`Task ${taskId} timed out after polling`)
}

async function processSkill(item, index, total) {
  const { id, slug, title, prompt } = item
  const outPng = join(coversHomeDir, `${slug}.png`)
  if (existsSync(outPng)) {
    try {
      const stat = statSync(outPng)
      if (stat.size > 10000) {
        console.log(`[Skip] ${slug} already exists (${stat.size} bytes)`)
        return
      }
    } catch {}
  }
  console.log(`[${index + 1}/${total}] Submitting: ${slug} (${title})...`)
  const startTime = Date.now()
  const taskId = await submitTask(prompt)
  console.log(`  -> Task ID: ${taskId}, polling...`)
  const imageUrl = await pollTask(taskId)
  console.log(`  -> Finished generation in ${Math.round((Date.now() - startTime) / 1000)}s! Downloading...`)

  // 下载原始图片
  const tmpRaw = join(coversHomeDir, `${slug}.raw.png`)
  const metaJson = join(coversHomeDir, `${slug}.generation.json`)

  const imgResp = await fetch(imageUrl)
  const buffer = Buffer.from(await imgResp.arrayBuffer())
  writeFileSync(tmpRaw, buffer)

  // 使用 ffmpeg 裁切中心 16:9 并缩放为 1280x720
  execSync(`ffmpeg -y -i "${tmpRaw}" -vf "crop=iw:iw*9/16,scale=1280:720" "${outPng}"`, { stdio: 'ignore' })
  try { execSync(`rm -f "${tmpRaw}"`) } catch {}

  // 记录 generation.json
  const genData = {
    skill: slug,
    generatedAt: new Date().toISOString(),
    tool: "omnimux_cli_gpt_image_2.5",
    request: {
      provider: "omnimux",
      model: "gpt-image-2.5",
      size: "1536x1024",
      quality: "high",
      prompt
    },
    taskId,
    imageUrl,
    output: `catalog/covers/home/${slug}.png`,
    width: 1280,
    height: 720
  }
  writeFileSync(metaJson, JSON.stringify(genData, null, 2) + "\n")
  console.log(`✓ Completed: ${slug}.png (1280x720)`)
}

// 5 并发运行池
async function runPool(items, concurrency = 5) {
  let cur = 0
  const workers = Array.from({ length: concurrency }, async (_, workerId) => {
    while (cur < items.length) {
      const idx = cur++
      try {
        await processSkill(items[idx], idx, items.length)
      } catch (err) {
        console.error(`❌ Failed on item ${items[idx].slug}:`, err)
      }
    }
  })
  await Promise.all(workers)
}

async function main() {
  console.log(`=== 开始批量生成 20 项官方精选封面（并发数: 5）===`)
  await runPool(SKILL_PROMPTS, 5)

  // 更新 catalog/index.json 中的 homeCover
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  let updatedCount = 0
  for (const item of catalog.items) {
    const promptItem = SKILL_PROMPTS.find(p => p.id === item.id)
    if (promptItem) {
      item.homeCover = {
        asset: `catalog/covers/home/${promptItem.slug}.png`,
        alt: promptItem.title
      }
      updatedCount++
    }
  }
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n')
  console.log(`\n🎉 全部完成！已在 catalog/index.json 中更新了 ${updatedCount} 个技能的 homeCover！`)
}

main().catch(err => {
  console.error("Fatal error:", err)
  process.exit(1)
})
