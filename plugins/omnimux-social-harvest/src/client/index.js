/**
 * @file omnimux-social-harvest 客户端入口 —— 注册词典、工作台 Tab 与设置卡片。
 * 模式对齐 omnimux-accounts：registerTab（betterSidebar）+ settings.plugin.item 紧凑卡。
 */

import { createElement } from 'react'

import { HarvestStage } from './HarvestStage.jsx'
import { SettingsCard } from './settings-card.jsx'
import { NS, en, zh } from './locales.js'

export const name = 'omnimux-social-harvest'
export const inject = ['slots', 'locale']

export const HARVEST_TAB_ID = 'omnimux-social-harvest:library'

function renderHarvestIcon(size = 16) {
  return createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': 'true',
  }, [
    createElement('circle', { key: 'c1', cx: '12', cy: '12', r: '9', stroke: 'currentColor', strokeWidth: '2' }),
    createElement('circle', { key: 'c2', cx: '12', cy: '12', r: '4.5', stroke: 'currentColor', strokeWidth: '2' }),
    createElement('circle', { key: 'c3', cx: '12', cy: '12', r: '1.4', fill: 'currentColor' }),
  ])
}

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'omnimux-social-harvest: dictionaries')
  const t = ctx.locale.bind(NS)

  const registerTab = (sidebar) => {
    if (!sidebar || typeof sidebar.registerTab !== 'function') return () => {}
    return sidebar.registerTab({
      id: HARVEST_TAB_ID,
      title: () => {
        try {
          const value = t('nav')
          if (value && value !== 'nav') return value
        } catch {}
        return '社媒采集'
      },
      icon: renderHarvestIcon,
      order: 19,
      hidden: false,
      single: true,
      component: (props) => createElement(HarvestStage, { ...props, t }),
    })
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['betterSidebar'], (inner) => {
      const sidebar = inner.betterSidebar ?? inner.get?.('betterSidebar')
      if (typeof ctx.effect === 'function') {
        ctx.effect(() => registerTab(sidebar), 'omnimux-social-harvest: library tab')
      } else {
        registerTab(sidebar)
      }
    })
  }

  // Settings → 插件 → 可配置：总开关紧凑卡（显式开启契约的 UI 载体）
  if (ctx.slots?.inject && ctx.slots?.register) {
    ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
      name: 'settings.plugin.item',
      key: 'omnimux-social-harvest',
      id: 'omnimux-social-harvest',
      locale: NS,
      inject: () => ({ t }),
    }, SettingsCard))
  }
}

export default { name, inject, apply }
