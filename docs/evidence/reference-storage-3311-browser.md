# #3311 参考素材设置真实浏览器验证

当前验收在任务私有HOME/DSH_HOME，正式DSH rc.2 base+web-app+packaged omnimux，不读共享Dev/Prod。所有配置/凭据为合成假值，不上传真实云或调用模型。

## 行为结果

实际ego运行正式 plugins/omnimux/tests/e2e/reference-storage.journey.mjs，jobbash-4581：保存成功提示、访问标识和秘密输入清空、GET响应不含两项合成值、重新打开配置保持、错误地址保存拒绝且旧设置不变，全部强值断言通过，返回pass/saved/credentialsRedacted/reopened/rejectedEditPreserved=true。

此同run截图Page.captureScreenshot超时，整体command exit1。行为通过不等于完整证据通过，不把该截图失败写PASS。同场景先前独立重启持久性/错误编辑截图与报告已在任务.workbuddy/evidence/reference-storage/ui-persistence/保留；不拿其旧截图冒同run身份。必须补齐最新截图与source/install摘要后最终验收。

## 清理

运行finally task.finish({keep:[]})及任务创建CLI SIGTERM等待exit完成。无保留页面/服务。登录token只在内存，未打印或写入证据。

## 最新完整证据

最终已审源码重新构建，通过唯一 tarball 路径正式安装；配置、宿主、生成入口、素材准备和客户端 bundle 五项摘要与任务源码一致。job bash-5157 实际执行完整旅程，全部强断言通过，同 run 截图采集成功，命令退出 0。脱敏结果及摘要见 [journey.json](reference-storage-3311/journey.json)，真实页面见 [settings.png](reference-storage-3311/settings.png)。截图为错误地址保存被拒绝的结尾状态，不表示已存地址被改为错误值。

最后代码修复独立复核通过，完整中枢 3357 项测试全通过、无跳过。旧失败记录保留，不改写其结果。

## 未完成

完整包测固定路由清单因新增项需维护但现有写前规则误拦尚未解，独立最终审查/CI/MQ/Dev未完成；不宣称功能交付。界面验证仅settings，不证明真实S3厂商互通或实际收费生成。
