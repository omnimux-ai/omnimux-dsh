/**
 * 「自动化」域类型真源。本文件只有 JSDoc `@typedef`，没有任何运行时导出，
 * 供 Host 与客户端用 `import('./types.js').X` 或 `@typedef {import('./types.js').X}` 引用。
 */

/**
 * @typedef {'active' | 'paused'} AutomationStatus
 */

/**
 * @typedef {'queued' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'cancelled'} AutomationRunStatus
 */

/**
 * @typedef {'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'} Weekday
 */

/**
 * 权限预设名称由 Host 的 permissionPresets 服务动态提供。
 *
 * @typedef {string} PermissionPreset
 */

/**
 * @typedef {object} OnceSchedule
 * @property {'once'} kind
 * @property {string} at
 * @property {string} timeZone
 */

/**
 * @typedef {object} IntervalSchedule
 * @property {'interval'} kind
 * @property {number} everyMinutes
 * @property {string} anchor
 * @property {string} timeZone
 */

/**
 * @typedef {object} DailySchedule
 * @property {'daily'} kind
 * @property {string} time
 * @property {string} timeZone
 */

/**
 * @typedef {object} WeeklySchedule
 * @property {'weekly'} kind
 * @property {readonly Weekday[]} weekdays
 * @property {string} time
 * @property {string} timeZone
 */

/**
 * @typedef {object} HourlySchedule
 * @property {'hourly'} kind
 * @property {number} minute
 * @property {string} timeZone
 */

/**
 * @typedef {object} MonthlySchedule
 * @property {'monthly'} kind
 * @property {number} day
 * @property {string} time
 * @property {string} timeZone
 */

/**
 * @typedef {object} CustomSchedule
 * @property {'custom'} kind
 * @property {number} everyDays
 * @property {string} time
 * @property {string} timeZone
 */

/**
 * @typedef {OnceSchedule | IntervalSchedule | DailySchedule | WeeklySchedule | HourlySchedule | MonthlySchedule | CustomSchedule} AutomationSchedule
 */

/**
 * @typedef {object} AutomationCreator
 * @property {'agent' | 'web'} kind
 * @property {string} sessionId
 */

/**
 * 一次无人值守运行的首条消息来源，不能伪装成人类输入。
 *
 * @typedef {object} AutomationMessageSource
 * @property {'automation'} kind
 * @property {string} automationId
 * @property {string} runId
 * @property {string} scheduledFor
 */

/**
 * @typedef {object} AutomationDefinition
 * @property {1} version
 * @property {string} id
 * @property {number} [maxConcurrentRuns]
 * @property {number} revision
 * @property {string} name
 * @property {string} prompt
 * @property {AutomationStatus} status
 * @property {AutomationSchedule} schedule
 * @property {string} rrule
 * @property {string} timeZone
 * @property {string} workspaceId
 * @property {string} cwd
 * @property {string} agentPreset
 * @property {string | null} provider
 * @property {string | null} model
 * @property {string | null | undefined} [reasoningEffort]
 * @property {PermissionPreset} permissionPreset
 * @property {AutomationCreator} createdBy
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {object} AutomationTargetSnapshot
 * @property {string} workspaceId
 * @property {string} cwd
 * @property {string} agentPreset
 * @property {string | null} provider
 * @property {string | null} model
 * @property {string | null | undefined} [reasoningEffort]
 * @property {PermissionPreset} permissionPreset
 */

/**
 * @typedef {object} AutomationRunError
 * @property {string} code
 * @property {string} message
 */

/**
 * @typedef {object} AutomationRun
 * @property {1} version
 * @property {string} id
 * @property {string} automationId
 * @property {string | undefined} [automationName]
 * @property {number} definitionRevision
 * @property {string} occurrenceKey
 * @property {'schedule' | 'manual'} trigger
 * @property {string} scheduledFor
 * @property {AutomationRunStatus} status
 * @property {string} promptSnapshot
 * @property {AutomationTargetSnapshot} targetSnapshot
 * @property {string | null} sessionId
 * @property {string | null} startedAt
 * @property {string | null} finishedAt
 * @property {string | null} summary
 * @property {AutomationRunError | null} error
 * @property {boolean} unread
 */

/**
 * @typedef {object} CreateAutomationInput
 * @property {string} id
 * @property {string} name
 * @property {string} prompt
 * @property {AutomationSchedule} schedule
 * @property {string} workspaceId
 * @property {string} cwd
 * @property {string} agentPreset
 * @property {string | null} [provider]
 * @property {string | null} [model]
 * @property {string | null | undefined} [reasoningEffort]
 * @property {number} [maxConcurrentRuns]
 * @property {PermissionPreset} [permissionPreset]
 * @property {AutomationCreator} createdBy
 * @property {string} now
 */

/**
 * @typedef {object} UpdateAutomationInput
 * @property {string} [name]
 * @property {string} [prompt]
 * @property {AutomationStatus} [status]
 * @property {AutomationSchedule} [schedule]
 * @property {string} [agentPreset]
 * @property {string | null} [provider]
 * @property {string | null} [model]
 * @property {string | null | undefined} [reasoningEffort]
 * @property {number} [maxConcurrentRuns]
 * @property {PermissionPreset} [permissionPreset]
 * @property {string} [workspaceId]
 * @property {string} [cwd]
 * @property {string} now
 */

/**
 * @typedef {object} DeleteAutomationPlan
 * @property {string} id
 * @property {true} preserveRunHistory
 */

export {}
