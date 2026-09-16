# 结构化验证报告：分享字段收敛到云端列宽（Issue #2121）

## 一、用户可见的失败

在分享浮层内如实展示（说明失败原因可读，属于上一处修复的成果）：

```
发布灵感失败: Error 1406 (22001): Data too long for column 'title' at row 1
```

## 二、云端列宽权威真源

上游网关模型 `model/inspiration_share.go`（`inspiration_shares` 表）：

```go
Category    string `json:"category" gorm:"type:varchar(128);not null"`
Title       string `json:"title" gorm:"type:varchar(255);not null"`
Description string `json:"description" gorm:"type:text"`
Prompt      string `json:"prompt" gorm:"type:text;not null"`
Model       string `json:"model" gorm:"type:varchar(128)"`
MediaType   string `json:"media_type" gorm:"type:varchar(32);default:'video'"`
```

| 字段 | 云端列类型 | 字符上限 | 本次处理 |
| --- | --- | --- | --- |
| `title` | `varchar(255)` | 255 | 收敛为原值前缀 |
| `category` | `varchar(128)` | 128 | 收敛为原值前缀 |
| `model` | `varchar(128)` | 128 | 收敛为原值前缀 |
| `description` | `text` | 无 | 不截断（客户端侧本就只送 200 字） |
| `prompt` | `text` | 无 | 不截断 |
| `media_type` | `varchar(32)` | 32 | 取值受限于既有二值契约，无需处理 |

`Error 1406` 是 MySQL 的「数据超长」；`22001` 是 SQLSTATE「字符串数据右截断」。

## 三、为什么必然触发

灵感导入条目的**标题常常就是整条帖文**。本机实测标题长度分布：

```
len=1933  insp_ad704927  video  x
len= 709  insp_3abdeb2a  video  x
len= 698  insp_b32d483b  video  x
len= 316  insp_2820b6cb  video  x
len= 275  insp_3756d110  video  x
len= 182  insp_f1561116  video  x   ← 不超过 255，历史分享成功
```

即：**凡标题超过 255 字符的条目，分享一律失败**；而这条分享原本只需把标题截短即可成功。

## 四、修复与验证

改动集中在两个发布路径的载荷装配处（中枢，唯一知道云端契约的层），把有界字段收敛后再发出：

- `clampShareColumn(value, limit)`：不超限原样返回；超限返回原值前缀；
  截断处若落在代理对中间则回退一个码元，绝不产生半个代理对（半个代理对不是合法文本，
  会让云端以另一种方式失败）。MySQL 按码点计数而 JS 按 UTF-16 码元计数，故此处度量只会偏保守。
- `SHARE_COLUMN_LIMITS`：`title: 255`、`category: 128`、`model: 128`，随代码显式记录云端契约。
- 本地发布（`publishLocal`）与云端发布（`publishRemote`）都经过同一收敛。

### 已验证项（真实输出）

| 验证 | 结果 |
| --- | --- |
| `node --test plugins/omnimux/src/official/inspiration-share.test.js` | **30 passed / 0 failed**（含新增 6 项） |
| 未超限值逐字返回（含空值与 `null`） | ✔ |
| 恰好等于上限时原样保留，不产生多余截断 | ✔ |
| 超限值截断后长度为 255 且为原值逐字前缀 | ✔ |
| 截断处落在 emoji 代理对中间时回退一个码元，末位不是高代理 | ✔ |
| 本地发布：1933 字标题 + 300 字分类 + 300 字模型 → 实际发出 255 / 128 / 128 | ✔ |
| 云端发布：超长标题同样收敛 | ✔ |
| 正常标题在两条链路上逐字不变 | ✔ |

### 测试的判别力

新增用例直接读取中枢交给官方客户端的请求体（`client.calls[0].opts.body`），
断言的是**真实发出的载荷**而不是内部变量；移除收敛实现即会失败，不存在「测了个恒真」的情况。

## 五、遗留与不确定项

1. **真实网关的最终确认**：本报告以云端建表真源为准。修复物化后将以开发版实机对
   1933 字标题的条目做一次真实分享，作为最终端到端确认；若真实列宽与模型真源不一致，
   该次实测会直接暴露出来并据此调整常量。
2. 修复只保证不因列宽失败；标题被截断后分享页展示的是原值前缀，这是本任务的既有要求
   （不追加省略号，避免改变用户内容）。
3. 未改动客户端：客户端仍把完整标题交给中枢，收敛只发生在发表前，
   因为中枢才是唯一知道云端契约的层。
