/**
 * 卡片图片的会话级缓存与预取。
 *
 * 卡片滚出视口再滚回来会重新走一次「占位 → 图片解码」的过程，观感就是闪一下白。
 * 这里做两件事：
 *   1. 记下已经请求过的图片地址（有上限、按最久未用淘汰），同一张图不重复预取；
 *   2. 把「下一屏要用到的图」提前交给浏览器解码，滚到那一屏时已经在内存里。
 *
 * 浏览器环境才真的发预取；Node 里跑单测时这些调用是无副作用的空操作，因此纯函数部分
 * 可以单独断言。
 */
import { LruCache } from './lru-cache.js'

/** 记住最近用过的图片地址。400 条约等于十几屏卡片，够来回翻十几页。 */
const requested = new LruCache(400)

/** @returns {boolean} 这个地址是否已经请求过。 */
export function hasRequestedMedia(url) {
  return url !== '' && requested.has(url)
}

/** 记下一个已经请求过的地址。 */
export function rememberMedia(url) {
  if (url === '') return
  requested.set(url, true)
}

/** 清空记录（测试与显式刷新用）。 */
export function clearRequestedMedia() {
  requested.clear()
}

/**
 * 提前把一组图片地址交给浏览器解码。
 *
 * 已经请求过的地址直接跳过，所以同一批数据反复经过不会产生重复请求。
 * @param {string[]} urls
 */
export function preloadMedia(urls) {
  if (typeof Image !== 'function') return
  for (const url of urls) {
    if (url === '' || requested.has(url)) continue
    requested.set(url, true)
    const image = new Image()
    image.decoding = 'async'
    image.src = url
  }
}

/**
 * 一屏之外再预取一屏：当前已加载的行里，取最后 `count` 条的封面作为下一屏的预热。
 * @param {{ coverUrl?: string }[]} items
 * @param {number} count
 */
export function preloadTrailingCovers(items, count = 20) {
  const slice = items.slice(Math.max(0, items.length - count))
  preloadMedia(slice.map((row) => row?.coverUrl ?? '').filter((url) => url !== ''))
}
