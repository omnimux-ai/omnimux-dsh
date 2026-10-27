/**
 * 产品库浏览器安全 UI 源库（单真源）。
 *
 * 产品库页面已经并入资产库的「产品库」Tab，产品插件不再注册自己的工作台 Tab。
 * 但它仍然是产品表单、产品卡片、链接解析与引用的唯一实现方：资产库在构建期
 * 直接复用本入口，避免出现第二份产品 UI 或同名不同值的样式。
 *
 * 本文件只导出浏览器可用的模块：不含 node:* 依赖，也不含宿主侧代码。
 * 宿主侧（HTTP 路由、工具、存储）仍然由 `src/index.js` 提供，与这里互不影响。
 */

export { ProductFormPage } from './ProductFormPage.jsx'
export { ProductGrid } from './ProductGrid.jsx'
export { CreateProductMenu, CREATE_KINDS, OPEN_DELAY_MS, CLOSE_DELAY_MS } from './CreateProductMenu.jsx'
export { useProductFormState } from './useProductFormState.js'
export { buildProductReference, deliverProductReference } from './reference.js'
export { ChatIcon, CheckIcon, PlusIcon } from './icons.jsx'
export { injectProductsStyles, PRODUCTS_CSS, STYLES_ID } from './styles.js'
export { NS, zh, en } from './locales.js'
export {
  createProduct,
  deleteProduct,
  draftPreviewUrl,
  getProductForEdit,
  getState,
  importFromLink,
  isHttpUrl,
  mediaPreviewUrl,
  pickPath,
  previewUrl,
  productsRequest,
  updateProduct,
} from './api.js'
