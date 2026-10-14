# #3296 签名宿主纯图片解码

## 目标与成功标准

修复正式Dev预检因sharp原生扩展TeamID拒绝的问题，不改宿主签名或跳过预检。PNG/JPEG/WebP静态完整解码、40MP上限和真实格式边界保持；无本机扩展/ffmpeg/网络默认加载，正式签名Node/Electron运行导入并解码成功。

## 基线与复用

基线8feba783cc6a9924633e3760671e03cb09db2a87。中枢inspect复用纯库pngjs、jpeg-js、image-size与jsquash WebP WASM；WASM从正式依赖本地读取并手动初始化，无fetch。领域仍只用公开mediaInspect。

## 实现与验证

先新增兼容/三格式/损坏/超大拒绝回归；替换原生依赖，保持素材MIME/尺寸合同。先元数据限尺寸再分配解码内存；动画不接受；完整原媒体测试保留，测试夹具不需要原生库。完整hub、边界与产品基线，离仓pack必须含WASM依赖，目标签名runtime实际解码，独立审查正常CI/MQ后再正式Dev同步。

## 边界/文档

不削弱图片安全、不隐藏格式错误、不修改宿主签名权限、不复制第三方私有/AGPL实现。无paidvideo/Prod/credentials/otherworkspace写。更新第三方说明与README为真实纯解码依赖。启动预检和实际Host探活通过后才宣称Dev交付。
