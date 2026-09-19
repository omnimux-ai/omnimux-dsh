/**
 * @file 社媒采集工作台页面 —— 左平台列表 + 右命令工具集 + 规格驱动弹窗表单。
 *
 * 交互契约（演示页 v3 用户已确认）：点击工具行 → 弹窗按命令 form 规格渲染表单 → 弹窗内校验/执行/回显。
 * 视觉契约：100% 消费官方 --dsw-alias-* Token（design.md §1.1/§3），控件一律 dsh-ui-kit（§2.4）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, DropdownSelect, InputField, ModalDialog } from 'dsh-ui-kit'

import { fetchStatus, runCommand } from './api.js'

const STYLES = `
.sh-root { display: flex; flex-direction: column; height: 100%; min-height: 0;
  color: var(--dsw-alias-label-primary); font-size: 13px; }
.sh-head { height: 48px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.sh-brand { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; }
.sh-brand-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
  background: var(--dsw-alias-state-business-tertiary); color: var(--dsw-alias-brand-primary);
  border: 1px solid var(--dsw-alias-brand-primary); }
.sh-env { display: flex; align-items: center; gap: 6px; font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  padding: 4px 10px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.sh-env .dot { width: 7px; height: 7px; border-radius: 50%; }
.sh-env.ok .dot { background: var(--dsw-alias-status-success); }
.sh-env.warn .dot { background: var(--dsw-alias-state-warn-primary); }
.sh-env.bad .dot { background: var(--dsw-alias-state-error-primary); }
.sh-layout { flex: 1; display: flex; min-height: 0; }
.sh-sites { width: 264px; flex-shrink: 0; overflow-y: auto; padding: 10px;
  border-right: 1px solid var(--dsw-alias-border-l1); }
.sh-site { display: flex; align-items: center; gap: 10px; padding: 10px;
  border-radius: 8px; cursor: pointer; border: 1px solid transparent; }
.sh-site:hover { background: var(--dsw-alias-interactive-bg-hover); }
.sh-site.sel { background: var(--dsw-alias-interactive-bg-active);
  border-color: var(--dsw-alias-brand-primary); }
.sh-glyph { width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700;
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l1); }
.sh-site.sel .sh-glyph { background: var(--dsw-alias-state-business-tertiary);
  color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.sh-site-meta { flex: 1; min-width: 0; }
.sh-site-name { font-size: 13px; font-weight: 600; }
.sh-site-sub { font-size: 11px; color: var(--dsw-alias-label-tertiary); margin-top: 1px; }
.sh-state { display: flex; align-items: center; gap: 5px; font-size: 11px; flex-shrink: 0; }
.sh-state .sdot { width: 6px; height: 6px; border-radius: 50%; }
.sh-state.on { color: var(--dsw-alias-label-success); }
.sh-state.on .sdot { background: var(--dsw-alias-status-success); }
.sh-state.off { color: var(--dsw-alias-label-tertiary); }
.sh-state.off .sdot { background: var(--dsw-alias-label-tertiary); }
.sh-state.free { color: var(--dsw-alias-brand-primary); }
.sh-state.free .sdot { background: var(--dsw-alias-brand-primary); }
.sh-detail { flex: 1; min-width: 0; overflow-y: auto; padding: 16px 20px 24px; }
.sh-detail-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.sh-detail-title { display: flex; align-items: center; gap: 10px; }
.sh-detail-title .sh-glyph { width: 36px; height: 36px; font-size: 14px; }
.sh-detail-name { font-size: 15px; font-weight: 650; }
.sh-detail-state { font-size: 12px; color: var(--dsw-alias-label-tertiary); margin-top: 1px; }
.sh-sec { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-tertiary);
  margin: 0 2px 8px; letter-spacing: .03em; }
.sh-cmds { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px; overflow: hidden; }
.sh-cmd { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 14px; cursor: pointer; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.sh-cmd:last-child { border-bottom: none; }
.sh-cmd:hover { background: var(--dsw-alias-interactive-bg-hover); }
.sh-cmd-name { font-size: 13px; font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.sh-cmd-desc { font-size: 12px; color: var(--dsw-alias-label-tertiary); margin-top: 2px; }
.sh-cmd-tags { display: flex; gap: 6px; flex-shrink: 0; align-items: center; }
.sh-tag { font-size: 11px; padding: 2px 8px; border-radius: 4px;
  border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-tertiary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.sh-tag.read { color: var(--dsw-alias-label-success); border-color: var(--dsw-alias-status-success); }
.sh-tag.auth { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.sh-banner { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 14px;
  background: var(--dsw-alias-state-business-tertiary); border: 1px solid var(--dsw-alias-brand-primary);
  border-radius: 8px; padding: 10px 12px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.sh-banner.warn { background: var(--dsw-alias-bg-layer-1); border-color: var(--dsw-alias-state-warn-primary); }
.sh-banner.bad { background: var(--dsw-alias-bg-layer-1); border-color: var(--dsw-alias-state-error-primary); }
.sh-field { margin-bottom: 14px; }
.sh-mresult { padding: 4px 0 14px; }
.sh-mr-head { font-size: 12px; color: var(--dsw-alias-label-success); margin-bottom: 8px; }
.sh-mr-row { padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px; margin-bottom: 6px; background: var(--dsw-alias-bg-layer-1); }
.sh-mr-t { font-size: 13px; word-break: break-all; }
.sh-mr-m { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px;
  color: var(--dsw-alias-label-tertiary); margin-top: 2px; }
.sh-merr { margin: 0 0 14px; padding: 10px 12px; border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-state-error-primary);
  font-size: 12px; color: var(--dsw-alias-label-secondary); }
.sh-merr .code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--dsw-alias-label-danger); font-size: 11px; }
.sh-merr .hint { margin-top: 4px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.sh-empty { text-align: center; color: var(--dsw-alias-label-tertiary); font-size: 13px; padding: 36px 0; }
.sh-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: var(--dsw-alias-bg-elevated); border: 1px solid var(--dsw-alias-border-l2);
  padding: 9px 16px; border-radius: 8px; font-size: 13px; z-index: 1200;
  color: var(--dsw-alias-label-primary); }
.sh-mfoot { display: flex; justify-content: flex-end; gap: 8px; }
`

const ChevronIcon = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** 结果条目摘要：挑标题与数字类字段展示（通用渲染，不为单站定制）。 */
function summarizeItem(item) {
  if (item === null || typeof item !== 'object') return { title: String(item), meta: '' }
  const titleKey = ['title', 'desc', 'text', 'content', 'name', 'id'].find((k) => typeof item[k] === 'string' && item[k] !== '')
  const title = titleKey ? String(item[titleKey]) : JSON.stringify(item).slice(0, 120)
  const metaKeys = ['author', 'user', 'username', 'nickname', 'plays', 'views', 'likes', 'comments', 'saves', 'url', 'link']
  const meta = metaKeys
    .filter((k) => item[k] !== undefined && item[k] !== null && item[k] !== '')
    .slice(0, 4)
    .map((k) => `${k}: ${String(item[k]).slice(0, 60)}`)
    .join(' · ')
  return { title: title.slice(0, 140), meta }
}

function Field({ spec, value, onChange }) {
  const label = (
    <>
      {spec.label}
      {spec.required ? <span style={{ display: 'none' }} /> : null}
    </>
  )
  if (spec.type === 'number') {
    return (
      <div className="sh-field">
        <InputField
          label={label}
          hint={spec.hint}
          type="number"
          min={spec.min}
          max={spec.max}
          value={String(value ?? spec.value)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    )
  }
  if (spec.type === 'select') {
    return (
      <div className="sh-field">
        <div className="sh-sec">{spec.label}</div>
        <DropdownSelect
          aria-label={spec.label}
          value={String(value ?? spec.value)}
          options={spec.choices.map(([v, l]) => ({ value: v, label: l }))}
          onChange={onChange}
        />
      </div>
    )
  }
  return (
    <div className="sh-field">
      <InputField
        label={label}
        hint={spec.hint}
        value={String(value ?? '')}
        placeholder={spec.placeholder ?? ''}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function CommandModal({ site, command, t, onClose }) {
  const [args, setArgs] = useState(() => {
    const init = {}
    for (const f of command.form) init[f.key] = f.value ?? ''
    return init
  })
  const [phase, setPhase] = useState('form') // form | running | done
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const missingRequired = command.form.some(
    (f) => f.required && f.type !== 'number' && String(args[f.key] ?? '').trim() === '',
  )

  const run = async () => {
    if (missingRequired) return
    setPhase('running')
    setError(null)
    setResult(null)
    const res = await runCommand({ site: site.id, command: command.id, args })
    if (!res.ok) {
      setPhase('form')
      setError(res.body?.error ?? { code: 'UNKNOWN', message: '执行失败', hint: '' })
      return
    }
    setResult(res.body)
    setPhase('done')
  }

  const needsAuth = command.tags.includes('auth')

  return (
    <ModalDialog
      open
      onClose={onClose}
      title={`${site.name} · ${command.id}`}
      description={command.summary}
      size="md"
      closeLabel={t('action.cancel')}
      footer={(
        <div className="sh-mfoot">
          <Button variant="secondary" onClick={onClose}>{t('action.cancel')}</Button>
          <Button variant="primary" onClick={run}
            loading={phase === 'running'}
            disabled={phase === 'form' && missingRequired && command.form.length > 0}>
            {t('action.run')}
          </Button>
        </div>
      )}
    >
      {needsAuth ? <div className="sh-banner">{t('modal.authNote')}</div> : null}
      {command.form.length === 0
        ? <div className="sh-sec">{t('modal.noInput')}</div>
        : command.form.map((f) => (
            <Field key={f.key} spec={f} value={args[f.key]}
              onChange={(v) => setArgs((prev) => ({ ...prev, [f.key]: v }))} />
          ))}
      {error ? (
        <div className="sh-merr">
          <div><span className="code">{error.code}</span> {error.message}</div>
          {error.hint ? <div className="hint">{error.hint}</div> : null}
        </div>
      ) : null}
      {phase === 'done' && result ? (
        <div className="sh-mresult">
          <div className="sh-mr-head">{t('result.done')} · {result.rawCount} {t('result.rows')}</div>
          {result.items.length === 0 ? <div className="sh-empty">{t('result.empty')}</div> : null}
          {result.items.slice(0, 8).map((item, i) => {
            const s = summarizeItem(item)
            return (
              <div className="sh-mr-row" key={i}>
                <div className="sh-mr-t">{s.title}</div>
                {s.meta ? <div className="sh-mr-m">{s.meta}</div> : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </ModalDialog>
  )
}

export function HarvestStage({ t, visible = true }) {
  // 保活契约（auto-qa-scan guards）：页面切走时隐藏而不卸载，回来时不重拉状态。
  // 注意：判定在渲染前执行，所有 hooks 无条件调用，避免 hooks 顺序违规。
  const [everOpened, setEverOpened] = useState(false)
  useEffect(() => { if (visible) setEverOpened(true) }, [visible])
  const hidden = !visible

  const [status, setStatus] = useState(null) // { enabled, env, sites }
  const [selectedSite, setSelectedSite] = useState('tiktok')
  const [loginStates, setLoginStates] = useState({}) // siteId → 'on' | 'off' | 'checking'
  const [modal, setModal] = useState(null) // { site, command }
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const showToast = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2400)
  }, [])

  useEffect(() => {
    fetchStatus().then((res) => { if (res.ok) setStatus(res.body) })
    return () => clearTimeout(toastTimer.current)
  }, [])

  const sites = useMemo(() => status?.sites ?? [], [status])
  const site = sites.find((s) => s.id === selectedSite) ?? sites[0]

  // 选中平台变化时后台自检登录态（free 平台跳过）
  useEffect(() => {
    if (!site || site.free || !site.login) return
    if (loginStates[site.id] === 'on' || loginStates[site.id] === 'checking') return
    setLoginStates((prev) => ({ ...prev, [site.id]: 'checking' }))
    runCommand({ site: site.id, command: 'whoami' }).then((res) => {
      setLoginStates((prev) => ({ ...prev, [site.id]: res.ok ? 'on' : 'off' }))
    })
  }, [site, loginStates])

  const doLogin = async () => {
    if (!site) return
    showToast(t('msg.loginOpened'))
    setLoginStates((prev) => ({ ...prev, [site.id]: 'checking' }))
    const res = await runCommand({ site: site.id, command: 'login' })
    if (res.ok) {
      setLoginStates((prev) => ({ ...prev, [site.id]: 'on' }))
      showToast(`${site.name} ${t('msg.connected')}`)
    } else {
      setLoginStates((prev) => ({ ...prev, [site.id]: 'off' }))
      showToast(res.body?.error?.message ?? t('msg.needLogin'))
    }
  }

  const envPill = useMemo(() => {
    if (!status) return { cls: 'warn', text: '…' }
    if (!status.enabled) return { cls: 'warn', text: t('msg.needEnable') }
    if (!status.env?.installed) return { cls: 'bad', text: t('env.missing') }
    if (!status.env?.bridgeOk) return { cls: 'warn', text: t('env.bridgeDown') }
    return { cls: 'ok', text: t('env.ready') }
  }, [status, t])

  const siteState = (s) => {
    if (s.free) return 'free'
    return loginStates[s.id] === 'on' ? 'on' : 'off'
  }
  const stateText = (s) => {
    if (s.free) return t('state.free')
    const st = loginStates[s.id]
    if (st === 'checking') return t('state.checking')
    return st === 'on' ? t('state.connected') : t('state.off')
  }

  if (!visible && !everOpened) return null

  return (
    <div className="sh-root" style={hidden ? { display: 'none' } : undefined}>
      <style>{STYLES}</style>
      <div className="sh-head">
        <div className="sh-brand"><span className="sh-brand-badge">OmniMux</span>{t('nav')}</div>
        <div className={`sh-env ${envPill.cls}`}><span className="dot" />{envPill.text}</div>
      </div>
      <div className="sh-layout">
        <aside className="sh-sites">
          {sites.map((s) => (
            <div key={s.id} role="button" tabIndex={0}
              className={`sh-site${site && s.id === site.id ? ' sel' : ''}`}
              onClick={() => setSelectedSite(s.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') setSelectedSite(s.id) }}>
              <div className="sh-glyph">{s.glyph}</div>
              <div className="sh-site-meta">
                <div className="sh-site-name">{s.name}</div>
                <div className="sh-site-sub">{s.commands.length} tools</div>
              </div>
              <div className={`sh-state ${siteState(s)}`}>
                <span className="sdot" />{stateText(s)}
              </div>
            </div>
          ))}
        </aside>
        <div className="sh-detail">
          {!status?.enabled ? <div className="sh-banner warn">{t('msg.needEnable')}</div> : null}
          {status?.enabled && !status.env?.installed ? <div className="sh-banner bad">{t('env.install')}</div> : null}
          {site ? (
            <>
              <div className="sh-detail-head">
                <div className="sh-detail-title">
                  <div className="sh-glyph">{site.glyph}</div>
                  <div>
                    <div className="sh-detail-name">{site.name}</div>
                    <div className="sh-detail-state">{stateText(site)}</div>
                  </div>
                </div>
                {!site.free && site.login && loginStates[site.id] !== 'on' ? (
                  <Button variant="outline" size="sm" onClick={doLogin}
                    loading={loginStates[site.id] === 'checking'}>
                    {t('action.login')}
                  </Button>
                ) : null}
              </div>
              <div className="sh-sec">{t('tools.title')}</div>
              <div className="sh-cmds">
                {site.commands.map((c) => (
                  <div key={c.id} className="sh-cmd" role="button" tabIndex={0}
                    onClick={() => setModal({ site, command: c })}
                    onKeyDown={(e) => { if (e.key === 'Enter') setModal({ site, command: c }) }}>
                    <div>
                      <div className="sh-cmd-name">{c.id}</div>
                      <div className="sh-cmd-desc">{c.summary}</div>
                    </div>
                    <div className="sh-cmd-tags">
                      {c.tags.map((tag) => <span key={tag} className={`sh-tag ${tag}`}>{tag}</span>)}
                      {ChevronIcon}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : <div className="sh-empty">…</div>}
        </div>
      </div>
      {modal ? <CommandModal site={modal.site} command={modal.command} t={t} onClose={() => setModal(null)} /> : null}
      {toast ? <div className="sh-toast">{toast}</div> : null}
    </div>
  )
}
