import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { apply, inject } from '../index.js'

describe('hub apply composition', () => {
  it('declares every synchronously-read host service', () => {
    assert.deepEqual(inject, ['tools', 'systemPrompt', 'agents'])
  })

  it('registers attachment entry commands only when the optional commands service is injected', () => {
    const injections = []
    apply({
      tools: { register() {} }, provide() {}, get() {},
      inject(deps, callback) { injections.push({ deps, callback }) },
    }, { official: { mount: false } })
    const registration = injections.filter(({ deps }) => deps.length === 1 && deps[0] === 'commands')
    assert.equal(registration.length, 1)
    const definitions = []
    const commands = { register(definition) { definitions.push(definition) } }
    registration[0].callback({ commands })
    assert.deepEqual(definitions.map(({ name, description }) => ({ name, description })), [
      { name: 'add-file', description: '添加文件 / Add files' },
      { name: 'add-from-library', description: '从资产库添加 / Add from library' },
    ])
    for (const definition of definitions) {
      assert.equal(Object.hasOwn(definition, 'input'), false)
      assert.deepEqual(definition.handler(), { kind: 'success' })
    }
  })

  it('registers media, text, identity, and catalog seams in a stable order', () => {
    const names = []
    const provided = []
    apply({
      tools: { register(tool) { names.push(tool.name) } },
      provide(name) { provided.push(name) },
      get() { return undefined },
    }, { official: { mount: false } })
    assert.deepEqual(provided, ['identity', 'hubEvents', 'workbenchMailbox', 'videoGenerate', 'imageGenerate', 'audioGenerate', 'speechToText', 'textComplete', 'decisions', 'modelCatalog'])
    assert.deepEqual(names, [
      'omnimux_video_submit',
      'omnimux_image_submit',
      'omnimux_audio_submit',
      'omnimux_audio_voices',
      'omnimux_speech_to_text',
      'omnimux_text_complete',
      'omnimux_jev_decision',
      'workbench_get_active_view',
      'workbench_open_tab',
      'omnimux_marketing_presets_search',
      'omnimux_creative_templates_search',
      'omnimux_creative_template_get',
    ])
  })

  it('passes token store and credentials seam to media generators', async () => {
    const provided = {}
    const tools = {}
    const credMock = {
      resolve: async (ref) => (ref === 'OMNIMUX_ACCESS_TOKEN' ? { value: 'pat-from-ctx-cred' } : undefined),
    }
    apply({
      tools: { register(tool) { tools[tool.name] = tool } },
      provide(name, api) { provided[name] = api },
      get(name) { return name === 'credentials' ? credMock : undefined },
    }, { official: { mount: false } })

    assert(provided.imageGenerate && typeof provided.imageGenerate.execute === 'function')
    assert(provided.videoGenerate && typeof provided.videoGenerate.execute === 'function')
    assert(provided.audioGenerate && typeof provided.audioGenerate.execute === 'function')
    assert(provided.modelCatalog && typeof provided.modelCatalog.list === 'function')
    const catalog = provided.modelCatalog.list()
    assert.equal(catalog.source, 'omnimux')
    assert.ok(Array.isArray(catalog.text))
    // Catalog includes the user-confirmed Gemini 3.8 mapping.
    assert.equal(catalog.text.length, 1)
    assert.equal(catalog.defaults.text, 'gemini-3.8-flash')
  })

  it('registers all 53 tools and 14 seams by default', () => {
    const names = []
    const provided = []
    apply({
      tools: { register(tool) { names.push(tool.name) } },
      provide(name) { provided.push(name) },
      get() { return undefined },
    })

    assert.equal(names.length, 54)
    assert.ok(names.includes('omnimux_video_submit'))
    assert.ok(names.includes('omnimux_image_submit'))
    assert.ok(names.includes('omnimux_audio_submit'))
    assert.ok(names.includes('omnimux_audio_voices'))
    assert.ok(names.includes('omnimux_speech_to_text'))
    assert.ok(names.includes('omnimux_text_complete'))
    assert.ok(names.includes('omnimux_jev_decision'))
    assert.ok(names.includes('omnimux_page_fetch'))
    assert.ok(names.includes('omnimux_social_data'))
    assert.ok(names.includes('omnimux_youtube_video'))
    assert.ok(names.includes('omnimux_youtube_channel'))
    assert.ok(names.includes('omnimux_youtube_posts'))
    assert.ok(names.includes('omnimux_youtube_search'))
    assert.ok(names.includes('omnimux_tiktok_video'))
    assert.ok(names.includes('omnimux_tiktok_user'))
    assert.ok(names.includes('omnimux_tiktok_posts'))
    assert.ok(names.includes('omnimux_tiktok_search'))
    assert.ok(names.includes('omnimux_tiktok_shop_search'))
    assert.ok(names.includes('omnimux_tiktok_shop_product'))
    assert.ok(names.includes('omnimux_instagram_post'))
    assert.ok(names.includes('omnimux_instagram_user'))
    assert.ok(names.includes('omnimux_instagram_posts'))
    assert.ok(names.includes('omnimux_instagram_search'))
    assert.ok(names.includes('omnimux_x_tweet'))
    assert.ok(names.includes('omnimux_x_user'))
    assert.ok(names.includes('omnimux_x_posts'))
    assert.ok(names.includes('omnimux_x_search'))
    assert.ok(names.includes('omnimux_accounts_list'))
    assert.ok(names.includes('workbench_get_active_view'))
    assert.ok(names.includes('workbench_open_tab'))
    assert.ok(names.includes('omnimux_marketing_presets_search'))

    assert.deepEqual(provided, ['identity', 'hubEvents', 'workbenchMailbox', 'videoGenerate', 'imageGenerate', 'audioGenerate', 'speechToText', 'textComplete', 'inspirationShare', 'socialData', 'youtube', 'tiktok', 'instagram', 'x', 'decisions', 'modelCatalog'])
  })

  it('disables all gated capabilities when gate.enabled is false', () => {
    const names = []
    const provided = []
    apply({
      tools: { register(tool) { names.push(tool.name) } },
      provide(name) { provided.push(name) },
      get() { return undefined },
    }, { gate: { enabled: false } })

    // workbench tools are ungated core facilities, marketing presets and creative templates are ungated
    assert.equal(names.length, 5)
    assert.deepEqual(provided, ['identity', 'hubEvents', 'workbenchMailbox', 'inspirationShare', 'socialData', 'youtube', 'tiktok', 'instagram', 'x', 'decisions', 'modelCatalog'])
  })

  it('fine-grained disables media, text models, and official tools via gate', () => {
    const tools = {}
    const provided = []
    apply({
      tools: { register(tool) { tools[tool.name] = tool } },
      provide(name) { provided.push(name) },
      get() { return undefined },
    }, {
      gate: {
        media: { video: false },
        tools: { omnimux_social_data: false },
        models: { textComplete: { 'grok-4.6': false } },
      },
    })

    assert.equal(tools.omnimux_video_submit, undefined)
    assert.ok(tools.omnimux_image_submit)
    assert.ok(tools.omnimux_audio_submit)
    assert.ok(tools.omnimux_audio_voices)
    assert.equal(tools.omnimux_social_data, undefined)
    assert.ok(tools.omnimux_youtube_video)
    assert.ok(tools.omnimux_tiktok_video)
    assert.ok(tools.omnimux_instagram_post)
    assert.ok(tools.omnimux_x_tweet)
    assert.ok(tools.omnimux_page_fetch)
    assert.ok(tools.omnimux_accounts_list)

    assert.deepEqual(provided, ['identity', 'hubEvents', 'workbenchMailbox', 'imageGenerate', 'audioGenerate', 'speechToText', 'textComplete', 'inspirationShare', 'socialData', 'youtube', 'tiktok', 'instagram', 'x', 'decisions', 'modelCatalog'])

    // grok-4.6 excluded from enum
    const textEnum = tools.omnimux_text_complete.parameters.properties.model.enum
    assert.ok(!textEnum.includes('grok-4.6'))
    assert.ok(textEnum.includes('gemini-3.7-flash'))
  })
})
