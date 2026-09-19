import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { registerDirectMediaRoutes } from '../plugins/omnimux/src/media/direct-http.js'
import { executeOmnimuxImage } from '../plugins/omnimux/src/media/image.js'
import { parseMediaConfig } from '../plugins/omnimux/src/media/route.js'

async function resolveApiKey() {
  if (process.env.OMNIMUX_API_KEY) return process.env.OMNIMUX_API_KEY.trim()
  const credPath = path.join(os.homedir(), '.dsh', '.credentials.yaml')
  if (fs.existsSync(credPath)) {
    const lines = fs.readFileSync(credPath, 'utf8').split('\n')
    for (const line of lines) {
      if (line.includes('OMNIMUX_API_KEY:')) {
        const val = line.split('OMNIMUX_API_KEY:')[1]?.trim()
        if (val) return val.replace(/^['"]|['"]$/g, '')
      }
    }
  }
  return undefined
}

async function runRealTest() {
  console.log('🚀 开始图片生成真实请求测试...')
  const apiKey = await resolveApiKey()
  console.log('🔑 凭证读取状态:', apiKey ? '已成功加载有效 API 密钥' : '未检测到密钥')

  if (!apiKey) {
    console.warn('⚠️ 未获取到有效 API 密钥，跳过联网真实请求测试')
    return
  }

  // 1. 启动轻量真实 HTTP 服务
  const routes = new Map()
  const mockWebServer = {
    register: ({ path, handler }) => {
      routes.set(path, handler)
      return () => routes.delete(path)
    },
  }

  const mediaConfig = parseMediaConfig(undefined)
  registerDirectMediaRoutes(mockWebServer, {
    executeImage: (req) => executeOmnimuxImage({
      ...req,
      media: mediaConfig,
      env: { OMNIMUX_API_KEY: apiKey },
    }),
    executeVideo: async () => ({ mode: 'live', url: 'mock.mp4' }),
  })

  const server = http.createServer(async (req, res) => {
    const handler = routes.get(req.url)
    if (handler) {
      await handler(req, res)
    } else {
      res.writeHead(404).end('Not Found')
    }
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  console.log(`🌐 直连生成服务已就绪: http://127.0.0.1:${port}`)

  // 2. 构造真实生图请求载荷
  const testDest = path.join(os.tmpdir(), `real_test_${Date.now()}.png`)
  const payload = {
    kind: 'image',
    prompt: 'A minimal modern ceramic coffee cup on dark oak table, soft cinematic lighting, 4k highly detailed',
    model: 'gpt-image-2.5',
    aspectRatio: '1:1',
    dest: testDest,
  }

  console.log('📤 正在向模型中枢发起生图请求...')
  console.log('   模型 ID:', payload.model)
  console.log('   提示词:', payload.prompt)

  const startTime = Date.now()
  const response = await fetch(`http://127.0.0.1:${port}/omnimux/api/media/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const durationMs = Date.now() - startTime
  const result = await response.json()

  server.close()

  console.log(`📥 收到响应 (状态码: ${response.status}, 用时: ${(durationMs / 1000).toFixed(2)}s):`)
  console.log(JSON.stringify(result, null, 2))

  assert.equal(response.status, 200, 'HTTP 响应必须为 200')
  assert.equal(result.ok, true, '执行结果必须 ok: true')
  assert.ok(result.url || fs.existsSync(testDest), '必须返回图片 URL 或生成有效本地文件')

  if (fs.existsSync(testDest)) {
    const stats = fs.statSync(testDest)
    console.log(`🎉 本地生成图片落地成功: ${testDest} (大小: ${stats.size} 字节)`)
    assert.ok(stats.size > 0, '生成的文件大小必须大于 0')
  }

  console.log('✅ 真实图片生成测试全部验证通过！')
}

runRealTest().catch((err) => {
  console.error('❌ 真实请求测试失败:', err)
  process.exit(1)
})
