import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RECREATE_PROMPT,
  RECREATE_SKILL,
  REPLICATE_CLEARED_EVENT,
  REPLICATE_SOURCE_PLUGIN,
  buildReplicateAttachmentPayload,
  findReplicateAttachment,
  isRecreateSkill,
  readReplicateEntityId,
  shouldReleaseReplicateAttachments,
} from './replicate-linkage.js'

/** 灵感库真实卡片行（字段名与 `mapSourceItem` 输出一致）。 */
const CARD = {
  id: 'insp_us_beauty',
  title: 'US beauty hook',
  region: 'US',
  industry: 'beauty',
  views: 12000000,
  engagement: 2.71,
  cover: '/omnimux/inspiration/local/media/covers/us-beauty.jpg',
  sourceUrl: '/omnimux/inspiration/local/media/videos/us-beauty.mp4',
  structure: '开场 3 秒反差 → 痛点放大 → 产品特写',
}

test('isRecreateSkill：按 id / slug / 名称三种身份都能认出复刻技能', () => {
  assert.equal(isRecreateSkill(RECREATE_SKILL), true)
  assert.equal(isRecreateSkill({ id: 'sk-omx-video-deconstruct' }), true)
  assert.equal(isRecreateSkill({ slug: 'video-deconstruct' }), true)
  assert.equal(isRecreateSkill({ name: '复刻爆款视频' }), true)
  assert.equal(isRecreateSkill({ title: '复刻爆款视频' }), true)
})

test('isRecreateSkill：别的技能与空值一律不认', () => {
  assert.equal(isRecreateSkill(null), false)
  assert.equal(isRecreateSkill(undefined), false)
  assert.equal(isRecreateSkill('复刻爆款视频'), false)
  assert.equal(isRecreateSkill({ id: 'sk-other', slug: 'video-hook-analysis', name: '视频拆解' }), false)
})

test('buildReplicateAttachmentPayload：卡片行映射为视频附件，封面与标题都在', () => {
  const payload = buildReplicateAttachmentPayload(CARD)

  assert.equal(payload.sourcePlugin, REPLICATE_SOURCE_PLUGIN)
  assert.equal(payload.kind, 'video')
  assert.equal(payload.entityId, 'insp_us_beauty')
  assert.equal(payload.title, 'US beauty hook')
  assert.equal(payload.extension, 'MP4')
  // 封面缩略图必须落到 previewUrl，卡面才画得出海报
  assert.equal(payload.previewUrl, '/omnimux/inspiration/local/media/covers/us-beauty.jpg')
  // 本地媒体绝对路径收敛成工作区相对路径，不把宿主绝对地址写进 @引用
  assert.equal(payload.relativePath, 'inspiration/videos/us-beauty.mp4')
  assert.equal(payload.metadata.isRecreateTarget, true)
  assert.equal(payload.metadata.structure, CARD.structure)
  assert.equal(payload.metadata.views, 12000000)
  assert.equal(payload.metadata.engagement, 2.71)
  assert.equal(payload.metadata.cover, '/omnimux/inspiration/local/media/covers/us-beauty.jpg')
})

test('buildReplicateAttachmentPayload：云端绝对地址不落进 @引用，标题缺失有兜底', () => {
  const payload = buildReplicateAttachmentPayload({
    id: 'insp_cloud_1',
    sourceUrl: 'https://cdn.example.com/viral/clip.mp4',
    cover: 'https://cdn.example.com/viral/poster.jpg',
  })
  assert.equal(payload.title, '对标爆款视频')
  assert.equal(payload.relativePath, 'inspiration/insp_cloud_1.mp4')
  assert.equal(payload.previewUrl, 'https://cdn.example.com/viral/poster.jpg')
  assert.equal(payload.metadata.sourceUrl, 'https://cdn.example.com/viral/clip.mp4')
})

test('buildReplicateAttachmentPayload：没有任何视频来源时仍给出可复刻的相对路径', () => {
  const payload = buildReplicateAttachmentPayload({ id: 'insp_only_id', title: '只有标题' })
  assert.equal(payload.relativePath, 'inspiration/insp_only_id.mp4')
  assert.equal(payload.previewUrl, '')
  assert.equal(payload.duration, '')
})

test('buildReplicateAttachmentPayload：无卡片或无 id 时不产出附件', () => {
  assert.equal(buildReplicateAttachmentPayload(null), null)
  assert.equal(buildReplicateAttachmentPayload({}), null)
  assert.equal(buildReplicateAttachmentPayload({ id: '   ' }), null)
})

test('readReplicateEntityId：只认标记为复刻对象的附件', () => {
  const payload = buildReplicateAttachmentPayload(CARD)
  assert.equal(readReplicateEntityId({ ...payload, metadata: payload.metadata }), 'insp_us_beauty')
  assert.equal(readReplicateEntityId({ entityId: 'insp_us_beauty', metadata: {} }), '')
  assert.equal(readReplicateEntityId({ entityId: 'insp_us_beauty', metadata: { isRecreateTarget: 'true' } }), '')
  assert.equal(readReplicateEntityId(null), '')
})

test('findReplicateAttachment：附件栏里捞出复刻对象，其它附件不误伤', () => {
  const replicate = { id: 'att_2', entityId: 'insp_us_beauty', metadata: { isRecreateTarget: true } }
  const others = [
    { id: 'att_1', entityId: 'ast_1', metadata: {} },
    replicate,
    { id: 'att_3', entityId: 'ast_2', metadata: {} },
  ]
  assert.equal(findReplicateAttachment(others), replicate)
  assert.equal(findReplicateAttachment([{ id: 'att_1', entityId: 'ast_1', metadata: {} }]), null)
  assert.equal(findReplicateAttachment(null), null)
})

test('复刻意图常量：极简提示词与复刻技能身份稳定', () => {
  assert.equal(RECREATE_PROMPT, '复刻这条爆款视频')
  assert.equal(RECREATE_SKILL.slug, 'video-deconstruct')
  assert.equal(RECREATE_SKILL.name, '复刻爆款视频')
  assert.equal(REPLICATE_CLEARED_EVENT, 'omnimux:replicate:cleared')
})

test('shouldReleaseReplicateAttachments：只有「复刻药丸被撤下」才撤附件，切换到别的技能不算', () => {
  // 药丸 ✕：通道清空，且清掉的就是复刻技能 → 撤附件
  assert.equal(shouldReleaseReplicateAttachments(null, RECREATE_SKILL), true)
  assert.equal(shouldReleaseReplicateAttachments(null, { slug: 'video-deconstruct' }), true)

  // 技能选择器点选别的技能：广播非空技能 → 复刻对象不得被静默删掉
  assert.equal(shouldReleaseReplicateAttachments({ id: 'sk-omx-other' }, { id: 'sk-omx-other' }), false)
  assert.equal(shouldReleaseReplicateAttachments(RECREATE_SKILL, RECREATE_SKILL), false)

  // 别的技能被清空：通道里钉着的不是复刻技能 → 与复刻无关
  assert.equal(shouldReleaseReplicateAttachments(null, { id: 'sk-omx-other' }), false)
  assert.equal(shouldReleaseReplicateAttachments(null, null), false)
  assert.equal(shouldReleaseReplicateAttachments(null, undefined), false)
})
