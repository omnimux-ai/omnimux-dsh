/**
 * 分享浮层浏览器验收夹具（Issue #1978）
 *
 * 装的是工作树源码里的真实组件、真实样式表与真实文案表；被替掉的只有页面之外的
 * 同名 Host/云端接口（与契约同形），因为无头浏览器里没有 Host 进程。
 *
 * 对外只暴露三个入口，供验收脚本驱动真实点击：
 *   window.__ready            —— 组件挂载完成
 *   window.__scenario(name)   —— 切换到 success / failed 场景并挂载对应记录
 *   window.__clickShare()     —— 点击「分享」打开浮层
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { INSPIRATION_CSS } from './styles.js'
import { zh } from './locales.js'
import { InspirationPreviewModal } from './InspirationPreviewModal.jsx'

const style = document.createElement('style')
style.textContent = INSPIRATION_CSS
document.head.appendChild(style)

const SHARE_ID = 'insp_e2e_9f2c41ab'
const SHARE_URL = `https://omnimux.ai/s/${SHARE_ID}`
const KEY_ERROR = '未配置 OmniMux 网关密钥（sk-）：请在凭据中配置 OMNIMUX_API_KEY 后再分享'

/** @type {'success' | 'failed'} */
let scenario = 'success'
let polls = 0

/** @param {number} status @param {unknown} body */
function json(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

/** 记录：成功场景从一条普通记录开始，由脚本化 Host 驱动整条发布链路。 */
function successRow() {
  return { id: 'insp-e2e-success', title: '曼哈顿电影感街景', content: '90 年代曼哈顿街景，电影质感' }
}

/** 记录：失败场景直接给一条"服务端已判失败"的记录——这才是用户回看时看到的状态。 */
function failedRow() {
  return {
    id: 'insp-e2e-failed',
    title: '曼哈顿电影感街景',
    content: '90 年代曼哈顿街景，电影质感',
    share_status: 'failed',
    share_stage: null,
    share_error: KEY_ERROR,
  }
}

/**
 * The Host contract the popover talks to, scripted:
 * start → 202 running, then the row advances through its real stages and settles
 * with the cloud's own link.
 */
window.fetch = async (url, opts = {}) => {
  const method = String(opts.method || 'GET').toUpperCase()
  const row = successRow()
  if (method === 'POST' && String(url).endsWith('/share')) {
    return json(202, { data: { ...row, share_status: 'running', share_stage: 'preparing' } })
  }
  polls += 1
  if (polls <= 1) return json(200, { data: { ...row, share_status: 'running', share_stage: 'uploading' } })
  return json(200, {
    data: {
      ...row,
      share_status: 'done',
      share_stage: null,
      share_id: SHARE_ID,
      share_url: SHARE_URL,
      share_storage_bucket: 'omnimux-files',
      share_is_admin: false,
      share_expires_in: '72h',
    },
  })
}

const root = createRoot(document.getElementById('host'))
const t = (key) => zh[key] || key

window.__scenario = (next) => {
  scenario = next
  polls = 0
  root.render(React.createElement(InspirationPreviewModal, {
    row: next === 'failed' ? failedRow() : successRow(),
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

/** 点击「创建链接」，与用户真实操作路径一致。 */
window.__clickCreate = () => {
  const button = document.querySelector('.omnimux-inspiration-share-submit-btn')
  if (!button) return false
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  return true
}

window.__ready = true

