/**
 * 实时模型目录 → provider 解析（#3629）。
 *
 * 宿主 `session/selectModel` 的 strict codec 把 `provider` 列为 required：缺省必被拒绝。
 * 因此扩展在钉定文本生成模型前必须先解析出 provider，解析不到就不能发钉定帧。
 *
 * 解析规则与设置面板的 ModelSelector 完全一致（同一个实现，避免两处漂移）：
 * 组内显式 `provider` → 组 `id` → 已知组名映射。面板把目录组 id 存进
 * `ModelGroup.provider`，所以把 ModelGroup 交给 {@link providerFromCatalogGroup}
 * 会得到同一个值。
 *
 * @module
 */

/**
 * 目录里既没有 `provider` 也没有 `id` 的组，按已知组名映射。
 *
 * 与 ModelSelector 的对话模型选择走的是同一张表：宿主目录的订阅组长期只有展示名。
 */
export const MODEL_PROVIDER_BY_GROUP_NAME: Record<string, string> = {
  'ChatGPT (Codex)': 'chatgpt',
  'Grok (Subscription)': 'grok',
  'OmniMux': 'omnimux',
}

/**
 * 解析一个目录分组的 provider。
 *
 * @param group 目录原始分组，或面板归一化后的 `ModelGroup`。
 * @returns 解析出的 provider，解析不到时为 `undefined`（调用方必须显式报错，不能发空 provider）。
 */
export function providerFromCatalogGroup(group: unknown): string | undefined {
  if (typeof group !== 'object' || group === null) return undefined
  const record = group as { provider?: unknown; id?: unknown; group?: unknown; name?: unknown }
  if (typeof record.provider === 'string' && record.provider.trim() !== '') return record.provider.trim()
  if (typeof record.id === 'string' && record.id.trim() !== '') return record.id.trim()
  const label = typeof record.group === 'string' && record.group !== ''
    ? record.group
    : typeof record.name === 'string' && record.name !== ''
      ? record.name
      : ''
  return MODEL_PROVIDER_BY_GROUP_NAME[label]
}

/**
 * 按 model id 在实时目录里回查 provider。
 *
 * @param catalog `session.modelCatalog` 的载荷（`{ groups: [...] }`）。
 * @param modelId 用户选中的文本生成模型 id。
 * @returns 该模型所在组的 provider；目录里没有这个模型时返回 `undefined`。
 */
export function providerForModelId(catalog: unknown, modelId: string): string | undefined {
  if (typeof catalog !== 'object' || catalog === null) return undefined
  const groups = (catalog as { groups?: unknown }).groups
  if (!Array.isArray(groups)) return undefined
  for (const group of groups) {
    if (typeof group !== 'object' || group === null) continue
    const models = (group as { models?: unknown }).models
    if (!Array.isArray(models)) continue
    const found = models.some((model) => (
      typeof model === 'object' && model !== null && (model as { id?: unknown }).id === modelId
    ))
    if (!found) continue
    return providerFromCatalogGroup(group)
  }
  return undefined
}
