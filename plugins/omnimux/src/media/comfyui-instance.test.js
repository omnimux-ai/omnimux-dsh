import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_COMFYUI_ENGINE_URL,
  DEFAULT_COMFYUI_PANEL_URL,
  U06_WORKFLOW_FILENAME,
  buildU06Prompt,
  downloadComfyOutput,
  fetchWorkflowBlueprint,
  generateComfyUiVideo,
  isComfyUiVideoRoute,
  pollComfyResult,
  resolveComfyUiEndpoints,
  submitComfyPrompt,
  uploadComfyAsset,
} from './comfyui-instance.js'

// TC-U06-01 双平面解析
test('TC-U06-01: endpoints resolve default pair and auto-convert uu/u domains', () => {
  const def = resolveComfyUiEndpoints({})
  assert.equal(def.panelBase, DEFAULT_COMFYUI_PANEL_URL)
  assert.equal(def.engineBase, DEFAULT_COMFYUI_ENGINE_URL)

  const panelOnly = resolveComfyUiEndpoints({
    OMNIMUX_COMFYUI_PANEL_URL: 'https://uu14326-79121a894bb2.westd.seetacloud.com:8443',
  })
  assert.equal(panelOnly.engineBase, 'https://u14326-79121a894bb2.westd.seetacloud.com:8443')

  const engineOnly = resolveComfyUiEndpoints({
    OMNIMUX_COMFYUI_ENGINE_URL: 'https://u14326-79121a894bb2.westd.seetacloud.com:8443',
  })
  assert.equal(engineOnly.panelBase, 'https://uu14326-79121a894bb2.westd.seetacloud.com:8443')
})

test('TC-U06-01b: route detection honors comfyui group, candidate suffix, and non-video exclusion', () => {
  assert.equal(isComfyUiVideoRoute({ capability: 'video', group: 'comfyui' }), true)
  assert.equal(isComfyUiVideoRoute({ capability: 'video', candidates: ['minimax-h3@comfyui'] }), true)
  assert.equal(isComfyUiVideoRoute({ capability: 'video', group: 'standard' }), false)
  assert.equal(isComfyUiVideoRoute({ capability: 'image', group: 'comfyui' }), false)
})

// TC-U06-02 节点重写与蓝本组装（9 图 3 视频 3 音频契约）
test('TC-U06-02: buildU06Prompt rewrites all U06 control nodes', () => {
  const blueprint = {
    620: { class_type: 'UNETLoader', inputs: { unet_name: 'x' } },
    137: { class_type: 'LoadImage', inputs: { image: 'placeholder.png' } },
    638: { class_type: 'VHS_LoadVideo', inputs: { video: 'placeholder.mp4' } },
    664: { class_type: 'CR Prompt Text', inputs: { prompt: '' } },
    132: { class_type: 'PrimitiveFloat', inputs: { value: 5 } },
    728: { class_type: 'BasicScheduler', inputs: { steps: 4 } },
    142: { class_type: 'easy seed', inputs: { seed: 0 } },
  }
  const wf = buildU06Prompt({
    workflow: blueprint,
    prompt: '分镜指令',
    uploadedImages: ['i1.png', 'i2.png', 'i3.png'],
    uploadedVideos: ['v1.mp4'],
    uploadedAudios: ['a1.mp3'],
    duration: 12,
    steps: 8,
    seed: 42,
  })
  assert.equal(wf['620'].inputs.unet_name, 'minimax/minimax_h3_ref2va_pruned_fp8_scaled.safetensors')
  assert.equal(wf['137'].inputs.image, 'i1.png')
  assert.equal(wf['638'].inputs.video, 'v1.mp4')
  assert.equal(wf['664'].inputs.prompt, '分镜指令')
  assert.equal(wf['132'].inputs.value, 12)
  assert.equal(wf['728'].inputs.steps, 8)
  assert.equal(wf['142'].inputs.seed, 42)
  // 原母版未被就地改写
  assert.equal(blueprint['664'].inputs.prompt, '')
})

// TC-U06-03 生命周期状态机
test('TC-U06-03: lifecycle upload → blueprint → submit → poll → download with stub fetcher', async () => {
  const calls = []
  const fetcher = async (url, init = {}) => {
    calls.push(`${init.method || 'GET'} ${url}`)
    if (url.includes('cdn.test')) {
      return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
    }
    if (url.includes('/upload/image')) {
      return { ok: true, json: async () => ({ name: 'uploaded.bin', subfolder: '', type: 'input' }) }
    }
    if (url.includes('/api/workflows/download/')) {
      return { ok: true, json: async () => ({ 620: { inputs: {} } }) }
    }
    if (url.endsWith('/prompt')) {
      return { ok: true, json: async () => ({ prompt_id: 'pid-1', number: 1, node_errors: {} }) }
    }
    if (url.includes('/history/pid-1')) {
      return {
        ok: true,
        json: async () => ({
          'pid-1': {
            status: { status_str: 'success', completed: true, messages: [] },
            outputs: { 732: { videos: [{ filename: 'out.mp4', subfolder: '', type: 'output' }] } },
          },
        }),
      }
    }
    if (url.includes('/view')) {
      return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
    }
    return { ok: false, status: 404, text: async () => 'not found' }
  }

  const name = await uploadComfyAsset({ engineBase: 'https://e.test', fileSource: 'https://cdn.test/a.png', fetcher })
  assert.equal(name, 'uploaded.bin')

  const bp = await fetchWorkflowBlueprint({ panelBase: 'https://p.test', fetcher })
  assert.deepEqual(bp, { 620: { inputs: {} } })

  const pid = await submitComfyPrompt({ engineBase: 'https://e.test', promptPayload: {}, fetcher })
  assert.equal(pid, 'pid-1')

  const out = await pollComfyResult({ engineBase: 'https://e.test', promptId: 'pid-1', intervalMs: 1, fetcher })
  assert.equal(out.filename, 'out.mp4')

  const dest = '/tmp/comfyui-u06-test-out.mp4'
  const path = await downloadComfyOutput({ engineBase: 'https://e.test', filename: 'out.mp4', dest, fetcher })
  assert.equal(path, dest)
  assert.ok(calls.some((c) => c.includes('/upload/image')))
  assert.ok(calls.some((c) => c.includes('/prompt')))
})

// TC-U06-04 契约上限：9 图 3 视频 3 音频切片
test('TC-U06-04: generateComfyUiVideo slices references to 9/3/3 contract', async () => {
  const uploads = []
  const fetcher = async (url, init = {}) => {
    if (url.includes('cdn.test')) {
      return { ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer }
    }
    if (url.includes('/upload/image')) {
      uploads.push(url)
      return { ok: true, json: async () => ({ name: `u${uploads.length}`, subfolder: '', type: 'input' }) }
    }
    if (url.includes('/api/workflows/download/')) {
      return { ok: true, json: async () => ({ 620: { inputs: {} }, 664: { inputs: {} }, 132: { inputs: {} }, 728: { inputs: {} }, 142: { inputs: {} }, 137: { inputs: {} }, 638: { inputs: {} } }) }
    }
    if (url.endsWith('/prompt')) {
      return { ok: true, json: async () => ({ prompt_id: 'pid-9' }) }
    }
    if (url.includes('/history/pid-9')) {
      return {
        ok: true,
        json: async () => ({
          'pid-9': {
            status: { completed: true },
            outputs: { 732: { videos: [{ filename: 'o.mp4', type: 'output' }] } },
          },
        }),
      }
    }
    return { ok: false, status: 404, text: async () => '' }
  }

  const payload = {
    prompt: 'p',
    image_urls: Array.from({ length: 12 }, (_, i) => `https://cdn.test/i${i}.png`),
    video_urls: Array.from({ length: 5 }, (_, i) => `https://cdn.test/v${i}.mp4`),
    audio_urls: Array.from({ length: 4 }, (_, i) => `https://cdn.test/a${i}.mp3`),
    duration: 12,
    steps: 8,
  }
  const result = await generateComfyUiVideo({ payload, fetcher, pollIntervalMs: 1 })
  // 9 图 + 3 视频 + 3 音频 = 15 次上传，超出契约的部分被裁掉
  assert.equal(uploads.length, 15)
  assert.equal(result.mode, 'live')
  assert.equal(result.taskId, 'pid-9')
  assert.ok(result.videoUrl.includes('o.mp4'))
})
