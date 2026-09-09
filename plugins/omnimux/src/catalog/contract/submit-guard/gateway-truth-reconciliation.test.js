import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getContractIndex, loadAdapterProfiles } from '../index.js'
import { mapOpenAiImageSize, mapValidatedPlanToVendor } from './map.js'
import { assertGuardSubmit, guardSubmit } from './index.js'

const index = getContractIndex()
const profiles = loadAdapterProfiles()
const imageProfile = profiles.profiles.find((p) => p.id === 'imageGenerate')
const videoProfile = profiles.profiles.find((p) => p.id === 'videoGenerate')
const audioProfile = profiles.profiles.find((p) => p.id === 'audioGenerate')
const sttProfile = profiles.profiles.find((p) => p.id === 'speechToText')

describe('Gateway Truth Reconciliation (SPEC-GATEWAY-TRUTH-001) Tests', () => {
  describe('T02: OpenAI / Grok / Seedream Image Contract & Mappings', () => {
    it('mapOpenAiImageSize maps all 8 ratios + auto correctly without aspect_ratio leakage', () => {
      // 1:1
      assert.deepEqual(mapOpenAiImageSize('1:1', '1K'), { size: '1024x1024' })
      assert.deepEqual(mapOpenAiImageSize('1:1', '2K'), { size: '1024x1024', quality: 'hd' })

      // Landscape clustering: 16:9, 4:3, 3:2, 21:9, auto
      for (const ratio of ['16:9', '4:3', '3:2', '21:9', 'auto']) {
        assert.deepEqual(mapOpenAiImageSize(ratio, '1K'), { size: '1792x1024' }, `ratio ${ratio}`)
        assert.deepEqual(mapOpenAiImageSize(ratio, '2K'), { size: '1792x1024' }, `ratio ${ratio}`)
      }

      // Portrait clustering: 9:16, 3:4, 2:3
      for (const ratio of ['9:16', '3:4', '2:3']) {
        assert.deepEqual(mapOpenAiImageSize(ratio, '1K'), { size: '1024x1792' }, `ratio ${ratio}`)
        assert.deepEqual(mapOpenAiImageSize(ratio, '2K'), { size: '1024x1792' }, `ratio ${ratio}`)
      }
    })

    it('gpt-image-2 submits across all 8 ratios + auto and maps extras.n to vendor.n', () => {
      const ratios = ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9']
      for (const aspectRatio of ratios) {
        const plan = assertGuardSubmit({
          model: 'gpt-image-2',
          operation: 'text_to_image',
          prompt: 'a majestic mountain sunrise',
          aspectRatio,
          n: 2,
        }, { seam: 'imageGenerate', outputType: 'image' })

        assert.equal(plan.ok, true)
        assert.equal('aspect_ratio' in plan.vendorPayload, false, 'aspect_ratio must not leak to OpenAI')
        assert.equal(plan.vendorPayload.n, 2)
        assert.equal(plan.logicalPayload.n, 2)

        if (aspectRatio === '1:1') {
          assert.equal(plan.vendorPayload.size, '1024x1024')
        } else if (['9:16', '3:4', '2:3'].includes(aspectRatio)) {
          assert.equal(plan.vendorPayload.size, '1024x1792')
        } else {
          assert.equal(plan.vendorPayload.size, '1792x1024')
        }
      }
    })

    it('image multi_reference routes first image to vendor.image for OpenAI', () => {
      const op = { id: 'multi_reference', output: { type: 'image' }, inputs: [] }
      const mapped = mapValidatedPlanToVendor({
        operation: op,
        profile: imageProfile,
        modelId: 'gpt-image-2',
        family: 'openai',
        prompt: 'make it snowy',
        bindings: [
          { role: 'reference', type: 'image', pathOrUrl: 'https://img1.png' },
          { role: 'reference', type: 'image', pathOrUrl: 'https://img2.png' },
        ],
        bySlot: new Map(),
      })
      assert.equal(mapped.ok, true)
      assert.equal(mapped.vendorPayload.image, 'https://img1.png')
      assert.equal('images' in mapped.vendorPayload, false)
      assert.equal('image_urls' in mapped.vendorPayload, false)
    })

    it('image multi_reference routes images to vendor.images for Grok', () => {
      const op = { id: 'multi_reference', output: { type: 'image' }, inputs: [] }
      const mapped = mapValidatedPlanToVendor({
        operation: op,
        profile: imageProfile,
        modelId: 'grok-imagine-image-2',
        family: 'grok',
        prompt: 'blend images',
        bindings: [
          { role: 'reference', type: 'image', pathOrUrl: 'https://img1.png' },
          { role: 'reference', type: 'image', pathOrUrl: 'https://img2.png' },
        ],
        bySlot: new Map(),
      })
      assert.equal(mapped.ok, true)
      assert.equal(mapped.vendorPayload.image, 'https://img1.png')
      assert.deepEqual(mapped.vendorPayload.images, ['https://img1.png', 'https://img2.png'])
    })

    it('image multi_reference routes image_urls to vendor.image_urls for Seedream', () => {
      const op = { id: 'multi_reference', output: { type: 'image' }, inputs: [] }
      const mapped = mapValidatedPlanToVendor({
        operation: op,
        profile: imageProfile,
        modelId: 'seedream-image-v2',
        family: 'seedream',
        prompt: 'portrait styling',
        bindings: [
          { role: 'reference', type: 'image', pathOrUrl: 'https://img1.png' },
          { role: 'reference', type: 'image', pathOrUrl: 'https://img2.png' },
        ],
        bySlot: new Map(),
      })
      assert.equal(mapped.ok, true)
      assert.equal(mapped.vendorPayload.image, 'https://img1.png')
      assert.deepEqual(mapped.vendorPayload.image_urls, ['https://img1.png', 'https://img2.png'])
    })
  })

  describe('T03: Video Model Parameters & Kling Anti-Degradation', () => {
    it('Kling 16:9 sets vendor.aspect_ratio and injects vendor.metadata without 1:1 degradation', () => {
      const op = { id: 'text_to_video', output: { type: 'video' }, inputs: [] }
      const mapped = mapValidatedPlanToVendor({
        operation: op,
        profile: videoProfile,
        modelId: 'kling-v3',
        family: 'kling',
        prompt: 'a cinematic drone shot',
        bindings: [],
        bySlot: new Map(),
        extras: { aspectRatio: '16:9' },
      })
      assert.equal(mapped.ok, true)
      assert.equal(mapped.vendorPayload.aspect_ratio, '16:9')
      assert.deepEqual(mapped.vendorPayload.metadata, { aspect_ratio: '16:9' })
      assert.equal('size' in mapped.vendorPayload, false)
    })

    it('Wan 3.0 forces uppercase resolution and vendor.audio sound mapping', () => {
      const op = { id: 'text_to_video', output: { type: 'video' }, inputs: [] }
      const mapped = mapValidatedPlanToVendor({
        operation: op,
        profile: videoProfile,
        modelId: 'wan-3.0',
        family: 'wan',
        prompt: 'flowing river',
        bindings: [],
        bySlot: new Map(),
        extras: { resolution: '720p', sound: true },
      })
      assert.equal(mapped.ok, true)
      assert.equal(mapped.vendorPayload.resolution, '720P')
      assert.equal(mapped.vendorPayload.audio, true)
      assert.equal('generate_audio' in mapped.vendorPayload, false)
    })

    it('Seedance 2.5 admits duration: -1 for adaptive duration', () => {
      const plan = assertGuardSubmit({
        model: 'seedance-2-5',
        operation: 'text_to_video',
        prompt: 'a dancing character',
        duration: -1,
      }, { seam: 'videoGenerate', outputType: 'video' })
      assert.equal(plan.ok, true)
      assert.equal(plan.vendorPayload.duration, -1)
      assert.equal(plan.logicalPayload.duration, -1)
    })

    it('MiniMax H3 Max and Turbo admit end_frame and first_last_frame', () => {
      for (const modelId of ['minimax-h3-max', 'minimax-h3-max-turbo']) {
        const contract = index.get(modelId)
        assert.ok(contract, `model ${modelId}`)
        const opIds = contract.operations.map((o) => o.id)
        assert.ok(opIds.includes('first_last_frame'), `${modelId} has first_last_frame`)
        assert.ok(opIds.includes('end_frame'), `${modelId} has end_frame`)
      }
    })
  })

  describe('T04: Audio Model & Suno / Doubao ASR Integration', () => {
    it('Suno maps title, tags, style, instrumental and duration correctly', () => {
      const op = { id: 'text_to_music', output: { type: 'audio' }, inputs: [] }
      const mapped = mapValidatedPlanToVendor({
        operation: op,
        profile: audioProfile,
        modelId: 'suno',
        prompt: 'melody of the wind',
        bindings: [],
        bySlot: new Map(),
        extras: {
          title: 'Wind Song',
          tags: 'acoustic, folk',
          style: 'calm',
          instrumental: true,
          duration: 60,
        },
      })
      assert.equal(mapped.ok, true)
      assert.equal(mapped.vendorPayload.prompt, 'melody of the wind')
      assert.equal(mapped.vendorPayload.title, 'Wind Song')
      assert.equal(mapped.vendorPayload.tags, 'acoustic, folk')
      assert.equal(mapped.vendorPayload.style, 'calm')
      assert.equal(mapped.vendorPayload.instrumental, true)
      assert.equal(mapped.vendorPayload.duration, 60)
      assert.equal(mapped.vendorPayload.model, 'suno')
    })

    it('Doubao ASR injects both url and audio_url for URL-first delivery', () => {
      const plan = assertGuardSubmit({
        model: 'doubao-asr-bigmodel',
        operation: 'speech_to_text',
        audio: 'https://cdn.example.com/audio/speech-record.wav',
        response_format: 'json',
      }, { seam: 'speechToText', outputType: 'text' })
      assert.equal(plan.ok, true)
      assert.equal(plan.vendorPayload.file, 'https://cdn.example.com/audio/speech-record.wav')
      assert.equal(plan.vendorPayload.url, 'https://cdn.example.com/audio/speech-record.wav')
      assert.equal(plan.vendorPayload.audio_url, 'https://cdn.example.com/audio/speech-record.wav')
      assert.equal(plan.vendorPayload.response_format, 'json')
    })

    it('audioGenerate maps format to vendor.format for non-speech operations', () => {
      const op = { id: 'voice_clone', output: { type: 'audio' }, inputs: [] }
      const mapped = mapValidatedPlanToVendor({
        operation: op,
        profile: audioProfile,
        modelId: 'seed-audio-clone',
        prompt: 'clone sample',
        bindings: [],
        bySlot: new Map(),
        extras: { format: 'wav' },
      })
      assert.equal(mapped.ok, true)
      assert.equal(mapped.vendorPayload.format, 'wav')
    })
  })
})
