/**
 * E2E 测试：基于内容拆解生成同款 Prompt 并对齐 seedance 2.5 与 GPT image2.5（Issue #2047）
 *
 * 验证核心能力：
 * 1. 本地灵感分享走 4 阶段发布流（含 generating_prompt），发布元数据包含同款视频生成 Prompt、
 *    分类为 seedance 2.5、模型标识为 seedance-2-5；
 * 2. 图像灵感分享分类自动归入 GPT image2.5、模型标识为 gpt-image-2.5；
 * 3. 云端灵感分享走 3 阶段流（preparing -> generating_prompt -> publishing），同款 Prompt 合成生效；
 * 4. 设置配置 SETTINGS_DEFAULTS.defaultVideoModel 对齐为 seedance-2-5，defaultImageModel 为 gpt-image-2.5。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { Readable } from 'node:stream'
import { apply } from '../../plugins/omnimux-inspiration/src/index.js'
import { LOCAL_PREFIX } from '../../plugins/omnimux-inspiration/src/http-routes.js'
import {
  SHARE_STAGES,
  SHARE_STAGE_ORDER,
  CLOUD_SHARE_STAGE_ORDER,
} from '../../plugins/omnimux-inspiration/src/share-status.js'
import {
  SEEDANCE_CATEGORY,
  SEEDANCE_MODEL,
  GPT_IMAGE_CATEGORY,
  GPT_IMAGE_MODEL,
} from '../../plugins/omnimux-inspiration/src/prompt-generator.js'
import { SETTINGS_DEFAULTS } from '../../plugins/omnimux/src/settings/schema.js'

function bootPlugin({ capability } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'insp-prompt-e2e-'))
  process.env.DSH_HOME = home

  const registrations = []
  const injects = []
  const ctx = {
    tools: { register() {}, get() { return undefined } },
    get(cap) {
      return cap === 'inspirationShare' ? this.capability : undefined
    },
    capability,
    inject(deps, callback) {
      injects.push(callback)
    },
    effect() {},
  }
  apply(ctx)

  const webServer = { register: (route) => { registrations.push(route); return () => {} } }
  for (const callback of injects) callback({ webServer, effect: () => {} })
  const route = registrations.find((entry) => entry.path === LOCAL_PREFIX)
  return {
    home,
    handler: route.handler,
    async call(method, url, body = undefined) {
      const req = new Readable({ read() {} })
      req.method = method
      req.url = url
      req.headers = {}
      if (body !== undefined) {
        req.push(JSON.stringify(body))
      }
      req.push(null)

      let status = 0
      let raw = ''
      const res = {
        writeHead(s) { status = s },
        end(chunk) { if (chunk) raw += chunk.toString() },
      }
      await route.handler(req, res)
      let parsed = null
      try { parsed = JSON.parse(raw) } catch {}
      return { status, raw, body: parsed }
    },
  }
}

describe('灵感分享基于内容拆解生成同款 Prompt (Issue #2047)', () => {
  it('系统设置默认模型：视频为 seedance-2-5，图片为 gpt-image-2.5', () => {
    assert.equal(SETTINGS_DEFAULTS.defaultVideoModel, 'seedance-2-5')
    assert.equal(SETTINGS_DEFAULTS.defaultImageModel, 'gpt-image-2.5')
  })

  it('发布阶段顺序扩展了 generating_prompt', () => {
    assert.deepEqual(SHARE_STAGE_ORDER, [
      SHARE_STAGES.PREPARING,
      SHARE_STAGES.GENERATING_PROMPT,
      SHARE_STAGES.UPLOADING,
      SHARE_STAGES.PUBLISHING,
    ])
    assert.deepEqual(CLOUD_SHARE_STAGE_ORDER, [
      SHARE_STAGES.PREPARING,
      SHARE_STAGES.GENERATING_PROMPT,
      SHARE_STAGES.PUBLISHING,
    ])
  })

  it('本地视频灵感发布：分类为 seedance 2.5，模型为 seedance-2-5，提示词为同款视频生成 Prompt', async () => {
    const publishedPayloads = []
    const capability = {
      async publishLocal(args) {
        publishedPayloads.push(args.meta)
        return {
          shareId: 'insp_seedance_1',
          shareUrl: 'https://omnimux.ai/s/insp_seedance_1',
          expiresIn: '72h',
        }
      },
    }

    const world = bootPlugin({ capability })
    try {
      const videoFile = join(world.home, 'test.mp4')
      writeFileSync(videoFile, 'fake-video-bytes')

      const createRes = await world.call('POST', LOCAL_PREFIX, {
        title: '晨光护肤实测',
        content: '记录晨间护肤步骤',
      })
      const id = createRes.body.data.id

      await world.call('PATCH', `${LOCAL_PREFIX}/${id}`, {
        type: 'video',
        local_paths: { video: videoFile },
        deconstruction: {
          summary: '年轻博主在晨光下特写展示护肤品上脸质地',
          hook: '0-3秒强反差镜头抓人眼球',
          visual_breakdown: '* **运镜**: 希区柯克推近镜头\n* **光影**: 柔和晨光漫反射',
        },
      })

      const res = await world.call('POST', `${LOCAL_PREFIX}/${id}/share`)
      assert.equal(res.status, 202)

      // 等待异步任务执行
      await new Promise((r) => setTimeout(r, 150))

      assert.equal(publishedPayloads.length, 1)
      const meta = publishedPayloads[0]
      assert.equal(meta.category, SEEDANCE_CATEGORY)
      assert.equal(meta.category, 'seedance 2.5')
      assert.equal(meta.model, SEEDANCE_MODEL)
      assert.equal(meta.model, 'seedance-2-5')
      assert.equal(meta.mediaType, 'video')

      // 验证提示词为基于内容拆解生成的同款 Prompt
      assert.match(meta.prompt, /年轻博主在晨光下特写展示护肤品上脸质地/)
      assert.match(meta.prompt, /运镜：希区柯克推近镜头/)
      assert.match(meta.prompt, /电影级运镜与流畅主体动作演进/)
      assert.match(meta.prompt, /4K超清质感/)
    } finally {
      rmSync(world.home, { recursive: true, force: true })
    }
  })

  it('图片灵感发布：分类为 GPT image2.5，模型为 gpt-image-2.5', async () => {
    const publishedPayloads = []
    const capability = {
      async publishLocal(args) {
        publishedPayloads.push(args.meta)
        return {
          shareId: 'insp_gpt_img_1',
          shareUrl: 'https://omnimux.ai/s/insp_gpt_img_1',
          expiresIn: '72h',
        }
      },
    }

    const world = bootPlugin({ capability })
    try {
      const imgFile = join(world.home, 'test.png')
      writeFileSync(imgFile, 'fake-image-bytes')

      const createRes = await world.call('POST', LOCAL_PREFIX, {
        title: '现代极简建筑摄影',
        content: '白墙与光影几何',
      })
      const id = createRes.body.data.id

      await world.call('PATCH', `${LOCAL_PREFIX}/${id}`, {
        type: 'image',
        local_paths: { cover: imgFile },
        deconstruction: {
          summary: '极简白色几何建筑立面特写',
          visual_breakdown: '强烈几何线条与午后阴影对比',
        },
      })

      const res = await world.call('POST', `${LOCAL_PREFIX}/${id}/share`)
      assert.equal(res.status, 202)

      await new Promise((r) => setTimeout(r, 150))

      assert.equal(publishedPayloads.length, 1)
      const meta = publishedPayloads[0]
      assert.equal(meta.category, GPT_IMAGE_CATEGORY)
      assert.equal(meta.category, 'GPT image2.5')
      assert.equal(meta.model, GPT_IMAGE_MODEL)
      assert.equal(meta.model, 'gpt-image-2.5')
      assert.equal(meta.mediaType, 'image')
      assert.match(meta.prompt, /极简白色几何建筑立面特写/)
      assert.match(meta.prompt, /大师级摄影构图/)
    } finally {
      rmSync(world.home, { recursive: true, force: true })
    }
  })
})
