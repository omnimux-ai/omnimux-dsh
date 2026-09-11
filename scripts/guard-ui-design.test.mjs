/**
 * scripts/guard-ui-design.test.mjs
 * Unit & Integration Test Suite for PreToolUse UI Design Guard
 * Contract: docs/system_design.md (T04), design.md (L1)
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { handle } from './guard-ui-design.mjs'
import { isTargetUIFile, inspectUICode, stripCssVarFallbacks } from './guard-ui-rules.mjs'
import { formatDenyReason } from './guard-ui-formatter.mjs'

describe('PreToolUse UI Design Guard (guard-ui-design.mjs)', () => {
  const UI_TARGET_FILE = 'plugins/omnimux/src/client/components/CustomToolbar.tsx'

  // ─────────────────────────────────────────────────────────────
  // 1) UI 违规代码被成功 deny，且 permissionReason 包含 [design.md](design.md) 与修复引导
  // ─────────────────────────────────────────────────────────────
  describe('1) 核心违规检测与阻断 (Deny on UI violations)', () => {
    it('UI01: 拦截原生 <button> 控件并附带 design.md 修复引导', () => {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: UI_TARGET_FILE,
          content: 'export function Toolbar() {\n  return <button onClick={handleClick}>Submit</button>\n}',
        },
      })
      const result = handle(payload)
      const out = result.hookSpecificOutput

      assert.equal(out.permissionDecision, 'deny')
      assert.ok(out.permissionReason.includes('UI01'), '应包含 UI01 规则码')
      assert.ok(out.permissionReason.includes('[design.md](design.md)'), '应包含 [design.md](design.md) 链接')
      assert.ok(out.permissionReason.includes('dsh-ui-kit'), '应引导使用 dsh-ui-kit')
      assert.equal(out.permissionDecisionReason, out.permissionReason)
    })

    it('UI01: 拦截原生 <select> 控件', () => {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: UI_TARGET_FILE,
          content: 'export function Selector() {\n  return <select><option value="1">One</option></select>\n}',
        },
      })
      const result = handle(payload)
      const out = result.hookSpecificOutput

      assert.equal(out.permissionDecision, 'deny')
      assert.ok(out.permissionReason.includes('UI01'), '应包含 UI01 规则码')
      assert.ok(out.permissionReason.includes('DropdownSelect'), '应引导使用 DropdownSelect')
    })

    it('UI02: 拦截内联业务样式属性', () => {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: UI_TARGET_FILE,
          content: 'export function Card() {\n  return <div style={{ padding: 16, cursor: "pointer" }}>Content</div>\n}',
        },
      })
      const result = handle(payload)
      const out = result.hookSpecificOutput

      assert.equal(out.permissionDecision, 'deny')
      assert.ok(out.permissionReason.includes('UI02'), '应包含 UI02 规则码')
      assert.ok(out.permissionReason.includes('[design.md](design.md)'), '应包含 design.md 引用')
    })

    it('UI03: 拦截裸色硬编码 (#hex 与 rgb/rgba)', () => {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: UI_TARGET_FILE,
          content: 'export const activeColor = "#3b82f6"\nexport const bgColor = "rgba(0, 0, 0, 0.5)"',
        },
      })
      const result = handle(payload)
      const out = result.hookSpecificOutput

      assert.equal(out.permissionDecision, 'deny')
      assert.ok(out.permissionReason.includes('UI03'), '应包含 UI03 规则码')
      assert.ok(out.permissionReason.includes('--dsw-alias-*'), '应引导使用官方 Token')
    })

    it('UI04: 拦截 Emoji 表情充当图标 (如 🚀, 🎬, ✨)', () => {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: UI_TARGET_FILE,
          content: 'export function Header() {\n  return <div className="icon">🚀</div>\n}',
        },
      })
      const result = handle(payload)
      const out = result.hookSpecificOutput

      assert.equal(out.permissionDecision, 'deny')
      assert.ok(out.permissionReason.includes('UI04'), '应包含 UI04 规则码')
      assert.ok(out.permissionReason.includes('Emoji'), '应提示禁止使用 Emoji 表情')
      assert.ok(out.permissionReason.includes('icon-design-standards.md'), '应包含图标规范契约链接')
    })

    it('UI04: 拦截 Unicode 字符充当图标 (如 ✕, ×, ↗)', () => {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: UI_TARGET_FILE,
          content: 'export function CloseBtn() {\n  return <button>✕</button>\n}',
        },
      })
      const result = handle(payload)
      const out = result.hookSpecificOutput

      assert.equal(out.permissionDecision, 'deny')
      assert.ok(out.permissionReason.includes('UI04'), '应包含 UI04 规则码')
      assert.ok(out.permissionReason.includes('Unicode 字符'), '应提示禁止使用 Unicode 字符充当图标')
    })

    it('UI10: 拦截非标字阶 (如 17px, 22px 等不在白名单的字号)', () => {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: UI_TARGET_FILE,
          content: 'const style = { fontSize: 17 }\nconst css = "font-size: 22px;"',
        },
      })
      const result = handle(payload)
      const out = result.hookSpecificOutput

      assert.equal(out.permissionDecision, 'deny')
      assert.ok(out.permissionReason.includes('UI10'), '应包含 UI10 规则码')
      assert.ok(out.permissionReason.includes('字阶白名单'), '应包含字阶白名单指引')
    })
  })

  // ─────────────────────────────────────────────────────────────
  // 2) 合规 UI 代码（使用 dsh-ui-kit Button、官方 CSS 变量）被成功 allow
  // ─────────────────────────────────────────────────────────────
  describe('2) 合规 UI 代码放行 (Allow compliant UI code)', () => {
    it('放行符合规范的 dsh-ui-kit 控件与官方 Token', () => {
      const compliantCode = `
import { Button, IconButton, DropdownSelect } from 'dsh-ui-kit'

export function SafeComponent() {
  return (
    <div style={{ '--stage-width': '100%', display: 'none' }}>
      <Button variant="primary" style={{ '--stage-color': 'var(--dsw-alias-brand-primary)' }}>
        Submit
      </Button>
      <DropdownSelect options={[]} />
      <span className="omx-safe-text">
        Text
      </span>
    </div>
  )
}
`
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: UI_TARGET_FILE,
          content: compliantCode,
        },
      })
      const result = handle(payload)
      assert.equal(result.hookSpecificOutput.permissionDecision, 'allow')
    })

    it('放行 CSS 变量回退值中的色值 var(--foo, #fff)', () => {
      const code = 'const color = "var(--dsw-alias-border, #e5e7eb)"\nconst bg = "var(--dsw-alias-bg-mask, rgba(0,0,0,0.5))"'
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: UI_TARGET_FILE,
          content: code,
        },
      })
      const result = handle(payload)
      assert.equal(result.hookSpecificOutput.permissionDecision, 'allow')
    })
  })

  // ─────────────────────────────────────────────────────────────
  // 3) 带 // exempt-ui0* 豁免注释的代码被成功 allow
  // ─────────────────────────────────────────────────────────────
  describe('3) 规范豁免注释放行 (Allow on explicit exemption comments)', () => {
    it('行内带 // exempt-ui01 豁免原生 button/select', () => {
      const code = '<button type="button" onClick={handleClick}>Submit</button> // exempt-ui01: 特殊第三方弹窗嵌入'
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: UI_TARGET_FILE,
          content: code,
        },
      })
      const result = handle(payload)
      assert.equal(result.hookSpecificOutput.permissionDecision, 'allow')
    })

    it('行内带 // exempt-ui02 豁免内联样式', () => {
      const code = '<div style={{ padding: 24, zIndex: 10 }}>Content</div> // exempt-ui02: 动态拖拽定位'
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: UI_TARGET_FILE,
          content: code,
        },
      })
      const result = handle(payload)
      assert.equal(result.hookSpecificOutput.permissionDecision, 'allow')
    })

    it('行内带 // exempt-ui03 豁免裸色', () => {
      const code = 'const BRAND_COLOR = "#7961f2"; // exempt-ui03: 极光紫品牌锁扣专属色'
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: UI_TARGET_FILE,
          content: code,
        },
      })
      const result = handle(payload)
      assert.equal(result.hookSpecificOutput.permissionDecision, 'allow')
    })

    it('行内带 // exempt-ui04 豁免字符图标', () => {
      const code = '<div>✕</div> // exempt-ui04: 既有历史组件待统一迁移'
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: UI_TARGET_FILE,
          content: code,
        },
      })
      const result = handle(payload)
      assert.equal(result.hookSpecificOutput.permissionDecision, 'allow')
    })

    it('普通尺寸乘号 (如 72×72px) 与 i18n 字典不误拦截', () => {
      const code = 'const dim = "72×72px";\nconst time = "7×24h";'
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: UI_TARGET_FILE,
          content: code,
        },
      })
      const result = handle(payload)
      assert.equal(result.hookSpecificOutput.permissionDecision, 'allow')
    })

    it('行内带 // exempt-ui10 豁免特化字号', () => {
      const code = 'const heroSize = { fontSize: 70 }; // exempt-ui10: 登录门禁 Hero 品牌大字'
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: UI_TARGET_FILE,
          content: code,
        },
      })
      const result = handle(payload)
      assert.equal(result.hookSpecificOutput.permissionDecision, 'allow')
    })
  })

  // ─────────────────────────────────────────────────────────────
  // 4) 非 UI 文件（如 scripts/foo.js、plugins/omnimux/src/node/bar.ts、测试文件等）直接 allow
  // ─────────────────────────────────────────────────────────────
  describe('4) 非 UI 客户端文件快速放行 (Fast-pass non-UI files)', () => {
    it('非 plugins 目录脚本直接放行', () => {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: 'scripts/verify-tools.mjs',
          content: '<button>test</button>\n#123456\nfontSize: 17',
        },
      })
      const result = handle(payload)
      assert.equal(result.hookSpecificOutput.permissionDecision, 'allow')
    })

    it('plugins/*/src/node 后端逻辑直接放行', () => {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: 'plugins/omnimux/src/node/server.ts',
          content: 'const color = "#ff0000";\nconst btn = "<button>html</button>";',
        },
      })
      const result = handle(payload)
      assert.equal(result.hookSpecificOutput.permissionDecision, 'allow')
    })

    it('单元测试与规格测试文件直接放行 (*.test.ts, *.spec.jsx, test-mocks)', () => {
      const testPaths = [
        'plugins/omnimux/src/client/App.test.tsx',
        'plugins/omnimux/src/client/Header.spec.jsx',
        'plugins/omnimux-publish/src/client/AccountsSidebar.disconnect.test-mocks.jsx',
      ]
      for (const p of testPaths) {
        const payload = JSON.stringify({
          hook_event_name: 'PreToolUse',
          tool_name: 'write',
          tool_input: {
            file_path: p,
            content: '<button>click</button>\nconst c = "#111111";',
          },
        })
        const result = handle(payload)
        assert.equal(result.hookSpecificOutput.permissionDecision, 'allow', `测试路径 ${p} 应被豁免`)
      }
    })

    it('Vendored openreel 目录及 canvas engine 内部实现直接放行', () => {
      const exemptPaths = [
        'plugins/omnimux-clip/src/client/openreel/ui/Button.tsx',
        'plugins/omnimux-workflow/src/canvas/nodes/CustomNode.tsx',
      ]
      for (const p of exemptPaths) {
        const payload = JSON.stringify({
          hook_event_name: 'PreToolUse',
          tool_name: 'write',
          tool_input: {
            file_path: p,
            content: '<button>click</button>',
          },
        })
        const result = handle(payload)
        assert.equal(result.hookSpecificOutput.permissionDecision, 'allow', `技术债/Vendor路径 ${p} 应被豁免`)
      }
    })

    it('非 edit/write 工具（如 bash）直接放行', () => {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'bash',
        tool_input: {
          command: 'git status',
        },
      })
      const result = handle(payload)
      assert.equal(result.hookSpecificOutput.permissionDecision, 'allow')
    })
  })

  // ─────────────────────────────────────────────────────────────
  // 5) edit 局部替换时的拦截与放行
  // ─────────────────────────────────────────────────────────────
  describe('5) edit 工具局部替换检查 (Differential edit inspections)', () => {
    it('edit: new_string 引入 UI 违规时触发阻断', () => {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'edit',
        tool_input: {
          file_path: UI_TARGET_FILE,
          old_string: '<div className="toolbar-placeholder" />',
          new_string: '<button className="toolbar-btn" onClick={onClick}>Run</button>',
        },
      })
      const result = handle(payload)
      const out = result.hookSpecificOutput

      assert.equal(out.permissionDecision, 'deny')
      assert.ok(out.permissionReason.includes('UI01'), '应拦截 new_string 中的原生 button')
    })

    it('edit: new_string 写入合规代码时放行', () => {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'edit',
        tool_input: {
          file_path: UI_TARGET_FILE,
          old_string: '<div className="toolbar-placeholder" />',
          new_string: '<Button variant="primary" onClick={onClick}>Run</Button>',
        },
      })
      const result = handle(payload)
      assert.equal(result.hookSpecificOutput.permissionDecision, 'allow')
    })

    it('edit: new_string 带有豁免注释时放行', () => {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'edit',
        tool_input: {
          file_path: UI_TARGET_FILE,
          old_string: '<div className="toolbar-placeholder" />',
          new_string: '<button type="button" onClick={onClick}>Run</button> // exempt-ui01: 业务特化',
        },
      })
      const result = handle(payload)
      assert.equal(result.hookSpecificOutput.permissionDecision, 'allow')
    })
  })
})
