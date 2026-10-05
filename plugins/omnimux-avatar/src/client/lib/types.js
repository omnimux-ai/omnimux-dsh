// 客户端共享类型（JSDoc @typedef）与常量。
// 本文件是纯类型 + 常量模块：无副作用、无外部依赖，浏览器与 node --test 均可直接导入。
//
// 来源：OmniMux/web/src/features/influencer/types.ts（只读真源）。
// 与真源的差异：真源的常量分散在 hooks/use-tasks.ts、lib/history-cache.ts、lib/multiview.ts 里；
// 这里把跨模块共享的那几个常量集中到本文件，作为唯一真源，其余文件从本文件导入。

// ── 常量（数值与真源逐字一致） ──────────────────────────────────────────────

/** 单次请求的记录条数：首屏要快，同时 with_artifacts 仍会对每条成功任务跑一次投影。 */
export const PAGE_SIZE = 12

/** 常规轮询间隔（毫秒）。 */
export const POLL_MS = 2000

/** 排队任务可能等好几分钟，一直按 2 秒轮询只是白花请求：超时后放慢。 */
export const POLL_SLOW_MS = 5000

/** 超过这个时长改用慢速轮询。 */
export const POLL_BACKOFF_AFTER_MS = 30000

/** 历史缓存条数上限：画廊本身会从网络分页拉取，缓存只买首屏，必须足够小。 */
export const MAX_ITEMS = 60

/**
 * localStorage 键。真源用 `influencer:` 前缀，这里按插件命名空间改名为
 * `omnimux-avatar:`，语义与版本信封不变。
 */
export const STORAGE_KEYS = Object.freeze({
  source: 'omnimux-avatar:source',
  viewMode: 'omnimux-avatar:view-mode',
  historyCache: 'omnimux-avatar:history-cache:v1',
  hiddenTasks: 'omnimux-avatar:hidden-tasks',
  currentAvatar: 'omnimux-avatar:current',
})

// ── 数据集类型 ────────────────────────────────────────────────────────────

/**
 * @typedef {object} InfluencerOption
 * @property {string} id
 * @property {string} label_en
 * @property {string[]} visibleIn 可见档位 id 列表
 * @property {string|null} [slot] 同槽位互斥标记
 * @property {string|null} [swatch]
 * @property {string|null} [imageUrl]
 */

/**
 * @typedef {object} InfluencerCategory
 * @property {string} id
 * @property {string} label_en
 * @property {'media'|'color'|'text'} kind
 * @property {number} max 该分类最多可选数量（0 视为 1）
 * @property {InfluencerOption[]} options
 */

/**
 * @typedef {object} InfluencerTaxonomy
 * @property {number} version
 * @property {string} source
 * @property {{ options: InfluencerOption[], comingSoonImageUrls: string[] }} tier_group
 * @property {string[]} category_priority
 * @property {InfluencerCategory[]} categories
 * @property {{ tiers: Record<string, string>, categories: Record<string, { id: string, fragment: string }[]> }} prompt_map
 */

/** @typedef {Record<string, string[]>} Selection */

/**
 * @typedef {object} SheetParams
 * @property {string} model
 * @property {string} [group]
 * @property {string} tier
 * @property {Selection} selection
 * @property {string} brief
 * @property {number} [seed]
 * @property {string} [size]
 * @property {string} [image_url]
 */

// ── 任务类型 ──────────────────────────────────────────────────────────────

/**
 * @typedef {object} TaskRecord
 * @property {number} id
 * @property {string} task_id
 * @property {string} [action]
 * @property {string} status
 * @property {string} [fail_reason]
 * @property {string} [progress]
 * @property {number} [quota]
 * @property {string} [created_at]
 * @property {number} [submit_time]
 * @property {number} [finish_time]
 * @property {{ input?: string, origin_model_name?: string, upstream_model_name?: string }} [properties]
 * @property {{ key?: string, content_url?: string, url?: string }[]} [artifacts]
 * @property {string} [result_url]
 * @property {string} [legacy_content_url]
 * @property {string} [imageUrl] 服务端在成品图确实存在时给出的站内相对取图地址
 */

/**
 * @typedef {object} InfluencerTaskMeta
 * @property {string} tier
 * @property {Selection} selection
 * @property {string} [brief]
 * @property {number} [seed]
 * @property {string} [size]
 * @property {string} [image_url]
 * @property {InfluencerTaskKind} [kind] `multiview` 表示由另一条任务派生的转面设定板；无 kind 即普通角色设定板
 * @property {string} [parent_task_id] 派生行的父任务 id
 */

/** @typedef {'sheet'|'multiview'} InfluencerTaskKind */
/** @typedef {'timeline'|'grid'} InfluencerViewMode */
/** @typedef {'explore'|'history'} InfluencerSource */

// ── 预设类型 ──────────────────────────────────────────────────────────────

/**
 * @typedef {object} ExplorePresetAsset
 * @property {string} path 站内镜像路径
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {object} ExplorePreset
 * @property {string} id
 * @property {string} name
 * @property {ExplorePresetAsset} preview
 * @property {ExplorePresetAsset} sheet
 * @property {string} tier
 * @property {Selection} selection
 * @property {string} [brief]
 * @property {number} [seed]
 */

/**
 * @typedef {object} PresetParamRow
 * @property {string} categoryId
 * @property {string} label
 * @property {string[]} options
 */

/**
 * @typedef {object} PresetSnapshot
 * @property {number} version
 * @property {string} source
 * @property {string} fetched_at
 * @property {ExplorePreset[]} items
 */

// ── 模型目录类型（偏离：真源读 OmniMux 网关 /api/pricing，这里读 DSH 中枢目录） ──

/**
 * @typedef {object} ChannelGroup 中枢渠道组投影行（catalog/project.js projectChannelGroups）
 * @property {string} id
 * @property {string} label
 * @property {string} [badge]
 * @property {string} wireGroup 提交时实际下发的渠道名
 * @property {{ pointsEstimate?: number, discountRate?: number, billingMode?: string }} [pricing]
 * @property {object} [constraints]
 * @property {boolean} enabled
 * @property {boolean} [default] 中枢标记的默认渠道
 */

/**
 * @typedef {object} ModelCatalogRow 中枢 /omnimux/model-catalog 的 image 行
 * @property {string} id
 * @property {string} label
 * @property {string} [family]
 * @property {string} [badge]
 * @property {string} [subtitle]
 * @property {object} [parameters]
 * @property {ChannelGroup[]} [channelGroups]
 */

/**
 * @typedef {object} ModelCatalog 中枢目录快照（至少含 image 列表）
 * @property {ModelCatalogRow[]} [image]
 * @property {ModelCatalogRow[]} [video]
 */

/**
 * @typedef {object} CascadeBrand 三级选择器的品牌层
 * @property {string} id
 * @property {string} name
 * @property {CascadeModel[]} models
 */

/**
 * @typedef {object} CascadeModel 三级选择器的模型层
 * @property {string} id
 * @property {string} name
 * @property {string} desc
 * @property {ModelCatalogRow} raw
 * @property {CascadeChannel[]} channels
 */

/**
 * @typedef {object} CascadeChannel 三级选择器的渠道层
 * @property {string} id
 * @property {string} name
 * @property {string} wireGroup
 * @property {boolean} enabled
 * @property {boolean} isDefault
 * @property {string} price
 * @property {string} tag
 * @property {string} billing
 * @property {string} ratio
 * @property {string} discount
 * @property {object} [constraints]
 */

// ── 形象（avatar）类型：本插件新增，真源无对应 ──────────────────────────────

/**
 * @typedef {object} AvatarSummary
 * @property {string} id
 * @property {string} name
 * @property {string} sheet
 * @property {number} [tasks]
 * @property {string} [assetId]
 * @property {object|null} [latestTask]
 */
