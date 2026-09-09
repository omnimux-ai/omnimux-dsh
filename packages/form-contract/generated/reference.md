# 表单协议参考（自动生成）

由契约结构、错误定义、命令目录及官方样例生成。请修改对应真源，再运行 `pnpm --config.verify-deps-before-run=false form: docs`。

协议版本：1。JSON Schema 仅表达结构约束；引用、覆盖、默认值、范围关系及填写语义还必须通过公开校验接口。

## 字段

| type | 含义 | 属性 |
| --- | --- | --- |
| text | 单行文本；不接受换行符 | id, label, description, required, type, minLength, maxLength, default |
| textarea | 多行文本；原样保留换行及特殊字符 | id, label, description, required, type, minLength, maxLength, default |
| file | 文件元数据及不透明素材引用；不执行上传或探测资源 | id, label, description, required, type, accept, maxFiles, maxBytes |
| number | 数字步进；范围及相对 min 的 step 必须满足 | id, label, description, required, type, min, max, step, default |
| slider | 滑块；规则与数字步进一致 | id, label, description, required, type, min, max, step, default |
| select | 单选卡片；输出选项的 value，label 仅用于显示 | id, label, description, required, type, options, default |
| aspect-ratio | 比例选择；配置正整数宽高比选项，不是媒体容器 | id, label, description, required, type, options, default |

完整字段类型、必填与默认值见 [配置 Schema](form.schema.json)；附件对象见 [附件 Schema](attachment.schema.json)。

## 命令

| 命令 | 行为 |
| --- | --- |
| `pnpm --config.verify-deps-before-run=false form: init --template <id> --id <new-id> --out <new-directory>` | 从官方样例创建配置、填写样例及预期草稿；目标目录必须不存在 |
| `pnpm --config.verify-deps-before-run=false form: check <definition.json> [values.json]` | 只读检查配置，提供 values 时同时检查填写数据 |
| `pnpm --config.verify-deps-before-run=false form: preview <definition.json> <values.json>` | 只读生成草稿 JSON，不上传文件、不发送消息 |
| `pnpm --config.verify-deps-before-run=false form: docs [--check]` | 更新生成参考；--check 只读检查漂移并在不一致时失败 |

## 错误码

| code | 含义 |
| --- | --- |
| INVALID_DEFINITION | 配置结构、属性或组件不符合协议 |
| UNSUPPORTED_VERSION | 协议版本不受支持；需要显式迁移 |
| DUPLICATE_FIELD | 字段标识重复 |
| INVALID_RANGE | 字段范围或步长无效 |
| DUPLICATE_OPTION | 选项值重复 |
| INVALID_DEFAULT | 默认值不符合字段规则 |
| INVALID_PLACEHOLDER | Prompt 占位符格式不合法 |
| UNKNOWN_REFERENCE | Prompt 或附件映射引用不存在的字段 |
| INVALID_MAPPING | 文本与附件映射类型不匹配或重复 |
| UNMAPPED_FIELD | 用户字段未参与 Prompt 或附件输出 |
| INVALID_VALUES | 填写数据必须是字段值对象 |
| UNKNOWN_FIELD | 填写数据包含未定义字段 |
| REQUIRED | 必填字段为空 |
| INVALID_VALUE | 填写值类型或格式错误 |
| OUT_OF_RANGE | 填写值长度、范围或步长不合规 |
| INVALID_OPTION | 填写值不在允许选项内 |
| INVALID_ATTACHMENT | 附件元数据不合规 |

## 配置实例

此代码块取自官方视频拆解模板，校验由 `pnpm --config.verify-deps-before-run=false verify:forms` 执行。

```json
{
  "protocolVersion": 1,
  "id": "video-deconstruct",
  "templateVersion": "1.0.1",
  "title": "参考视频拆解",
  "description": "分析参考视频的结构、节奏和表达，为后续复刻提供依据。",
  "examples": [
    {
      "ref": "/api/omnimux/forms/examples/replication-demo.mp4",
      "title": "原创产品结构示意：开场、细节、收尾",
      "kind": "video"
    }
  ],
  "fields": [
    {
      "id": "reference_video",
      "type": "file",
      "label": "参考视频",
      "required": true,
      "accept": [
        "video/mp4",
        "video/webm"
      ],
      "maxFiles": 1,
      "maxBytes": 104857600
    },
    {
      "id": "focus",
      "type": "text",
      "label": "分析重点",
      "required": true,
      "maxLength": 300
    },
    {
      "id": "detail",
      "type": "select",
      "label": "拆解粒度",
      "required": true,
      "options": [
        {
          "value": "逐镜头",
          "label": "逐镜头"
        },
        {
          "value": "按段落",
          "label": "按段落"
        }
      ],
      "default": "逐镜头"
    }
  ],
  "prompt": "请拆解附带的参考视频。\n分析重点：{{focus}}\n拆解粒度：{{detail}}\n请输出钩子、镜头结构、节奏、画面与声音表达，并区分可观察事实和推断。",
  "attachments": [
    "reference_video"
  ]
}
```
