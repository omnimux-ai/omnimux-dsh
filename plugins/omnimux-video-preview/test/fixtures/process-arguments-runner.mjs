import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'

const config = JSON.parse(process.argv[2])
const calls = []
const executeFile = childProcess.execFileSync
childProcess.execFileSync = (file, args, options) => {
  calls.push({ file, args, options })
  return executeFile(file, args, options)
}
syncBuiltinESMExports()

globalThis.fetch = async () => { throw new Error('Network is disabled in process-argument fixtures') }

const { extractVideoBreakdown } = await import('../../src/breakdown/analyzerPipeline.js')
const { detectPhysicalScenes } = await import('../../src/scene-detect.js')
const analysisVideos = []
const sceneInputs = []
const ctx = {
  get(name) {
    if (name === 'textComplete') {
      return {
        async execute(params) {
          analysisVideos.push(params.video)
          return `## 1. 叙事结构链路 (Narrative Pipeline)
Hook → Product Intro

## 2. 结构阶段解构 (Stage Breakdown)
### Hook
开场展示

### Product Intro
核心展示

## 3. 逐镜头分镜脚本表 (Shot Breakdown Table)
| 时间跨度 | 分镜标题 | 所属阶段 | 镜头属性标签 | 画面与动作描述 |
| :--- | :--- | :--- | :--- | :--- |
| 0:00 - 0:02 | 开场 | Hook | 特写, 平视 | 动作展示 |
| 0:02 - 0:04 | 展示 | Product Intro | 特写, 平视 | 细节展示 |`
        },
      }
    }
    if (name === 'videoProcess' && config.serviceScenes) {
      return {
        async execute(params) {
          sceneInputs.push(params.input)
          return { result: { scenes: config.serviceScenes } }
        },
      }
    }
    return null
  },
}

const results = []
for (let index = 0; index < (config.repeat || 1); index++) {
  results.push(config.mode === 'scenes'
    ? await detectPhysicalScenes(config.videoPath, { ctx })
    : await extractVideoBreakdown(config.videoPath, { ctx, meta: { coverUrl: 'fallback-cover.jpg' } }))
}
process.stdout.write(JSON.stringify({ results, calls, analysisVideos, sceneInputs }))
