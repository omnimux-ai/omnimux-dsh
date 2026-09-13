/**
 * 宿主运行时最小替身：离线单测只验证本插件自己的逻辑，
 * 不需要真正的 Session / 工具注册表 / schemastery。
 */

export const SessionId = value => value
export const WorkspaceId = value => value
export const createUserMessage = value => value
export const installModelSelection = () => () => {}
export const setApprovalPolicy = (session, policy) => session.append('approval/policy', { policy })
export const defineTool = definition => definition

/** schemastery 替身：够用的链式声明 + 默认值投影，只覆盖本插件的 Config 形状。 */
const schemaNode = (fallback) => {
  const api = {
    __default: fallback,
    default: value => schemaNode(value),
    step: () => api,
    min: () => api,
    max: () => api,
    optional: () => api,
  }
  return api
}

const schemastery = {
  number: () => schemaNode(undefined),
  string: () => schemaNode(undefined),
  boolean: () => schemaNode(undefined),
  object: shape => (input = {}) => Object.fromEntries(
    Object.entries(shape).map(([key, node]) => [key, input[key] ?? node?.__default]),
  ),
}

export default schemastery
