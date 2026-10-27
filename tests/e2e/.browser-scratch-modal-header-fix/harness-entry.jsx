/**
 * 云端分享浮层浏览器验收夹具（Issue #1996）
 *
 * 装的是工作树源码里的真实组件、真实样式表与真实文案表（esbuild 解析到
 * plugins/omnimux-inspiration/src/client/），被替掉的只有页面之外的 Host 接口：
 * 无头浏览器里没有 Host 进程，所以 `window.fetch` 用与 Host 契约同形的脚本化
 * 响应顶上，行数据与 `handleShare` 真正写回的行一致。
 *
 * 两条旅程，各自走各自的行：
 *   cloud —— 云端条目（`is_local:false`，云端公开目录的 camelCase 字段）：
 *            POST /share → 202 running/preparing → 轮询 publishing → done + 链接，
 *            行上带 `share_media_skipped:'video'`（上游工单 #257 的降级结果）。
 *   local —— 本地条目（`insp_…`）：POST /share → 202 running/preparing →
 *            轮询停在 uploading，用于证明三步进度未被改动波及。
 *
 * 对外入口（供验收脚本驱动真实点击与取证）：
 *   window.__ready          组件挂载完成
 *   window.__scenario(name) 切到 cloud / local 并挂载对应记录
 *   window.__clickShare()   点「分享」打开浮层
 *   window.__clickCreate()  点「创建链接」
 *   window.__calls          本场景发往 Host 的全部请求（含是否疑似上传）
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { INSPIRATION_CSS } from './styles.js'
import { zh } from './locales.js'
import { InspirationPreviewModal } from './InspirationPreviewModal.jsx'

const style = document.createElement('style')
style.textContent = INSPIRATION_CSS
document.head.appendChild(style)

const SITE = 'https://omnimux.ai'
const COVER_PATH = '/api/inspiration/v1/public/media/inspiration-covers/'
const PUBLICATION_PATH = '/api/inspiration/v1/public/media/r2/publications/'
const CLOUD_ID = '2690'
const LOCAL_ID = 'insp_e2e_local_4c1d'
const SHARE_URL = `${SITE}/s/insp_cloud_e2e_7a31`

/**
 * 云端条目：字段与云端公开列表同形（camelCase），`is_local:false` 是 feed 给
 * 云端行的标记 —— 也正是第一次点击就应走零上传通道的依据。
 */
function cloudRow() {
  return {
    id: CLOUD_ID,
    type: 'video',
    title: '情绪共鸣型助眠歌单推广',
    caption: 'Give it a try 🥺',
    category: 'Health & Wellness',
    coverUrl: `${COVER_PATH}${CLOUD_ID}`,
    mediaUrls: [`${PUBLICATION_PATH}genviral/videos/${CLOUD_ID}/video.mp4`],
    is_local: false,
  }
}

/** 本地条目：Host 自己库里的记录，走上传链路。 */
function localRow() {
  return {
    id: LOCAL_ID,
    title: '本地街景复刻',
    content: '本地素材仍按上传链路发布',
    is_local: true,
  }
}

/** @type {'cloud' | 'local'} */
let scenario = 'cloud'
let polls = 0

/** 本场景发往 Host 的每一个请求；「无上传调用」就是在这上面断言的。 */
const calls = []
window.__calls = calls

/** @param {number} status @param {unknown} body */
function json(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

/**
 * 一次请求是否属于素材上传。
 *
 * 页面侧的上传只有两种可能：打到上传端点，或直接提交 multipart/FormData 体。
 * 云端旅程两者都必须为 0。
 * @param {string} url @param {Record<string, any>} options
 */
function isUploadCall(url, options) {
  if (/upload/i.test(String(url))) return true
  const body = options?.body
  if (typeof FormData !== 'undefined' && body instanceof FormData) return true
  const headers = options?.headers || {}
  const contentType = String(headers['content-type'] || headers['Content-Type'] || '')
  return /multipart\/form-data/i.test(contentType)
}

/** 云端任务行：POST 那一刻服务端写的「进行中」行。 */
function cloudRunningRow(stage) {
  return { ...cloudRow(), share_status: 'running', share_stage: stage, share_source: 'cloud' }
}

/**
 * 云端任务行的终态：视频读不到也照常出链接，但行上带 `share_media_skipped`，
 * 界面据此在结果区标注。
 */
function cloudDoneRow() {
  return {
    ...cloudRow(),
    share_status: 'done',
    share_stage: null,
    share_source: 'cloud',
    share_id: 'insp_cloud_e2e_7a31',
    share_url: SHARE_URL,
    share_storage_bucket: 'omnimux-files',
    share_is_admin: false,
    share_expires_in: '72h',
    share_media_skipped: 'video',
  }
}

/** 本地任务行的进行中状态：上传阶段是真的在走，轮询停在这里供截图取证。 */
function localRunningRow(stage) {
  return { ...localRow(), share_status: 'running', share_stage: stage, share_source: 'local' }
}

window.fetch = async (url, options = {}) => {
  const method = String(options.method || 'GET').toUpperCase()
  const target = String(url)
  const body = options.body
  calls.push({
    method,
    url: target,
    upload: isUploadCall(target, options),
    body: typeof body === 'string' ? body : body ? '[non-text-body]' : '',
  })

  if (method === 'POST' && target.endsWith('/share')) {
    return json(202, { data: scenario === 'cloud' ? cloudRunningRow('preparing') : localRunningRow('preparing') })
  }

  polls += 1
  if (scenario === 'cloud') {
    // 第一次轮询就该看到「发布中」：云端链路没有上传腿，两个阶段之间不存在第三站。
    if (polls <= 1) return json(200, { data: cloudRunningRow('publishing') })
    return json(200, { data: cloudDoneRow() })
  }
  return json(200, { data: localRunningRow('uploading') })
}

const root = createRoot(document.getElementById('host'))
const t = (key) => zh[key] || key

window.__scenario = (next) => {
  scenario = next
  polls = 0
  calls.length = 0
  root.render(React.createElement(InspirationPreviewModal, {
    row: next === 'cloud' ? cloudRow() : localRow(),
    t,
    onClose() {},
  }))
  return true
}

window.__clickShare = () => {
  const trigger = document.querySelector('.omnimux-inspiration-share-trigger-btn')
  if (!trigger) return false
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  return true
}

/** 点「创建链接」，与用户真实操作路径一致。 */
window.__clickCreate = () => {
  const button = document.querySelector('.omnimux-inspiration-share-submit-btn')
  if (!button) return false
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  return true
}

window.__ready = true
