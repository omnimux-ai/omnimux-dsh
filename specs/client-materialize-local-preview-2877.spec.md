# 规格说明：客户端前置物化本地同源资产为 Data URL 规避老后台 403/未重启异常

**Issue**: #2877  
**状态**: 实施中  
**范围**: `plugins/omnimux/src/client/media-viewer/MediaViewerTab.jsx`  

---

## 1. 目标与背景

用户在图像生成页面进行二次生成（如图片编辑/图生图/参考图），选入资产库素材后：
- 资产库素材的原型 URL 为站内 HTTP 路由（如 `/omnimux/assets/library/preview?...`）；
- 如果桌面应用后端 Node 进程未重启，老后端的 `gateway-upload` 仅支持已知的两类特定路径，不支持资产库预览路由，直接报错 `不支持的本地素材地址`；
- 方案：在客户端执行提交前的 `materializeAssetFile` 阶段，对站内同源相对路径或本地预览地址，由前端浏览器直接 fetch 其二进制 Blob 并通过 `FileReader` 自动转为标准的 Base64 `data:image/png;base64,...` URL。

---

## 2. 详细实现契约

在 `MediaViewerTab.jsx` 的 `materializeAssetFile` 中：
- 若 `asset.type === 'image'` 且 `asset.url` 为站内相对路径或指向当前 origin 的本地文件 URL（非 data:）；
- 由前端通过 `fetch(asset.url)` 获取图片 Blob；
- 体积合规（≤5MB）时使用 `FileReader` 转换为 `data:image/png;base64,...`；
- 老后端收到 `data:` URL 后天然走 `kind: 'data'` 上传云端对象存储，彻底实现零后端重启兼容。
