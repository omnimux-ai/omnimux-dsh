// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 配对契约守卫（Issue #2078）。
 *
 * 桥端对每个客户端都要求配对令牌（安全扫描 BROWSER-01 取消了回环
 * `chrome-extension://` 免密捷径），而扩展一侧曾长期宣称「本机回环留空即可
 * 免密连接」、默认令牌又为空——用户照着界面留空，就永久停在通用错误
 * 「未连接 dsh」上，没有任何可执行的下一步。这组断言把不变量钉死：桥端不再
 * 放行无令牌客户端时，任何用户可见文案都不得再承诺免密，且空令牌必须被指名
 * 道姓地报出来。
 */
describe('Pairing contract guard (#2078)', () => {
  const root = resolve(__dirname, '..')
  const serverSource = readFileSync(resolve(root, '../src/server.ts'), 'utf8')
  const backgroundSource = readFileSync(resolve(root, 'src/background/index.ts'), 'utf8')
  const panelSource = readFileSync(resolve(root, 'src/panel/App.tsx'), 'utf8')
  const stringsSource = readFileSync(resolve(root, 'src/panel/strings.ts'), 'utf8')
  const styles = readFileSync(resolve(root, 'src/panel/styles.css'), 'utf8')

  it('requires the pairing token from every client, with no loopback origin shortcut', () => {
    expect(serverSource).toContain('if (!verifyToken(this.deps.token, frame.token))')
    // 回环免密捷径一旦回归，本任务全部文案的前提就不成立。
    expect(serverSource).not.toContain('chrome-extension://')
    expect(serverSource).not.toContain('loopbackNoToken')
  })

  it('stops promising a password-free local connection in either locale', () => {
    expect(stringsSource).not.toContain('本机回环免密')
    expect(stringsSource).not.toContain('leave empty for loopback')
    expect(stringsSource).not.toContain('Firefox 和远程部署需要填写')
    expect(stringsSource).not.toContain('Required by Firefox and remote deployments')

    expect(stringsSource).toContain('任何实例都需要配对令牌，本机同样需要')
    expect(stringsSource).toContain('Pairing token required by every instance, local included')
    expect(stringsSource).toContain("tokenPlaceholder: '粘贴配对令牌'")
    expect(stringsSource).toContain("tokenPlaceholder: 'Paste the pairing token'")

    expect(panelSource).not.toContain('本机回环免密连接请留空')
    expect(panelSource).not.toContain('可选 Token（本机回环留空即可免密连接）')
    expect(panelSource).toContain('任何实例都需要配对令牌（本机同样需要）')
  })

  it('names the missing pairing token instead of the generic disconnect error', () => {
    expect(backgroundSource).toContain("if (settings.token.trim() === '')")
    expect(backgroundSource).toContain('未连接 dsh：还没有配对令牌')
    expect(backgroundSource).toContain('dsh is not connected: no pairing token yet')
    // 令牌已填写时保留地址/令牌不符的通用文案，不再误报为「缺令牌」。
    expect(backgroundSource).toContain('未连接 dsh（请检查设置中的地址与 token）')
  })

  it('trims a pasted token before persisting so a trailing newline cannot read as a wrong token', () => {
    expect(panelSource).toContain('const next = { ...settings, token: settings.token.trim() }')
    expect(panelSource).toContain('await api.updateSettings(next)')
  })

  it('renders the media shelf bare, without the removed background card', () => {
    expect(panelSource).not.toContain('page-media-bar')
    expect(styles).not.toContain('.page-media-bar')
    expect(styles).toContain('.composer > .media-sniffer-shelf')
    expect(panelSource).toContain('<MediaSnifferBar')
  })
})
