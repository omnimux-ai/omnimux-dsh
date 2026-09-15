/** Client half: locale dictionaries, and the
 *  products workbench tab on dsh-better-sidebar. */
import { createElement } from 'react'
import { NS, en, zh } from './locales.js'
import { ProductsStage } from './ProductsStage.jsx'

export const name = 'omnimux-products'
export const inject = ['slots', 'locale']

export const PRODUCTS_TAB_ID = 'omnimux-products:library'

function renderProductsIcon(size = 16) {
  return createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
  }, [
    createElement('path', {
      key: 'p1',
      fill: 'currentColor',
      d: 'M12.841 15.1L12 13l-.841 2.1L9 15.292l1.64 1.489L10.146 19L12 17.821L13.854 19l-.494-2.219L15 15.292zM6 2h12v2H6zM4 6h16v2H4z',
    }),
    createElement('path', {
      key: 'p2',
      fill: 'currentColor',
      d: 'M20 12v8H4v-8zm0-2H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2',
    }),
  ])
}

/**
 * @param {{
 *   locale: { register: Function, bind: Function },
 *   slots: { inject: Function, register: Function },
 *   inject?: Function,
 *   effect?: Function,
 * }} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'omnimux-products: dictionaries')
  const t = ctx.locale.bind(NS)

  // 产品库已作为一级选项卡整合入资产库，侧边栏不再常驻独立入口

  const registerProductsTab = (sidebar) => {
    if (!sidebar || typeof sidebar.registerTab !== 'function') return () => {}
    return sidebar.registerTab({
      id: PRODUCTS_TAB_ID,
      title: () => {
        try {
          const value = t('nav')
          if (value && value !== 'nav') return value
        } catch {}
        return '产品库'
      },
      icon: renderProductsIcon,
      order: 16,
      hidden: false,
      single: true,
      component: (props) => createElement(ProductsStage, { ...props, t }),
    })
  }

  const bindWorkbench = (patch) => {
    try {
      window.__omnimuxWorkbench?.bind?.(patch)
    } catch {}
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['betterSidebar'], (inner) => {
      const sidebar = inner.betterSidebar ?? inner.get?.('betterSidebar')
      bindWorkbench({ betterSidebar: sidebar })
      if (typeof ctx.effect === 'function') {
        ctx.effect(() => registerProductsTab(sidebar), 'omnimux-products: library tab')
      } else {
        registerProductsTab(sidebar)
      }
    })
    ctx.inject(['layout', 'sessions'], (inner) => {
      bindWorkbench({ layout: inner.layout, sessions: inner.sessions })
    })
  }
}
