import React, { useEffect } from 'react'

/**
 * 创作模式切换胶囊栏（Agent / 营销 / 短剧）
 * 根据用户需求与极简原则，新建会话（Hero 阶段）及所有会话阶段彻底移除该三项 Tab 切换栏。
 * 组件保持静默返回 null，并自动清理可能存在的 DOM 锚点节点，确保界面纯净聚焦。
 */
export function ComposerModeTabs() {
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const anchor = document.getElementById('omnimux-composer-mode-anchor')
      if (anchor) {
        anchor.remove()
      }
    }
  }, [])

  return null
}
