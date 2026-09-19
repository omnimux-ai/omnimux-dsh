import { useState, useEffect } from 'react'
import { PageHeader } from 'dsh-ui-kit'
import { injectDeviceStyles } from './styles.js'

const TAB_ID = 'omnimux-device:library'

export function DeviceStage({ t, stage, store, visible = true }) {
  const [activeTab, setActiveTab] = useState('fleet')
  const [toastMsg, setToastMsg] = useState('')

  useEffect(() => {
    injectDeviceStyles()
  }, [])

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (!api || typeof api.attachStore !== 'function' || !store) return undefined
    api.attachStore(store)
    return () => { api.detachStore?.(store) }
  }, [store])

  const handleClose = () => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (api && typeof api.closeTab === 'function') {
      api.closeTab(TAB_ID)
    } else {
      stage?.set?.(false)
    }
  }

  const showToast = (msg) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 2400)
  }

  const title = typeof t === 'function' ? t('title') : '移动真机矩阵与设备智能体中枢'
  const subtitle = typeof t === 'function' ? t('subtitle') : '本地物理真机阵列纳管，11项底层健康自检与双脑决策控制回路'

  return (
    <div
      role="region"
      aria-label={title}
      aria-hidden={visible ? undefined : 'true'}
      className="omnimux-device-stage"
      style={{ display: visible ? 'flex' : 'none' }}
    >
      <PageHeader
        title={title}
        subtitle={subtitle}
        onClose={handleClose}
        actionSlot={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="omx-btn-subtle" onClick={() => showToast('已对全部设备重新执行 11 项健康自检，全部指标正常')}>
              全量重新体检
            </button>
            <button className="omx-btn-ink" onClick={() => showToast('请通过 USB 数据线将 iPhone 接入当前 Mac 并在手机上点击信任')}>
              + 接入新手机
            </button>
          </div>
        }
      />

      {/* 选项卡导航 */}
      <div className="omx-stage-tabs">
        <button
          className={`omx-stage-tab-btn ${activeTab === 'fleet' ? 'active' : ''}`}
          onClick={() => setActiveTab('fleet')}
        >
          真机大屏与体检
        </button>
        <button
          className={`omx-stage-tab-btn ${activeTab === 'schedules' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedules')}
        >
          周排期发布日历
        </button>
        <button
          className={`omx-stage-tab-btn ${activeTab === 'inspector' ? 'active' : ''}`}
          onClick={() => setActiveTab('inspector')}
        >
          故障断点对比器
        </button>
        <button
          className={`omx-stage-tab-btn ${activeTab === 'signing' ? 'active' : ''}`}
          onClick={() => setActiveTab('signing')}
        >
          苹果开发者证书
        </button>
        <button
          className={`omx-stage-tab-btn ${activeTab === 'warmup' ? 'active' : ''}`}
          onClick={() => setActiveTab('warmup')}
        >
          自动化养号策略
        </button>
      </div>

      {/* 视口内容 */}
      <div className="omx-stage-content">
        {activeTab === 'fleet' && (
          <div className="omx-grid-4">
            <div className="omx-card" onClick={() => showToast('已打开 01号机 (iPhone 13) 实时调试面板')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <strong style={{ fontSize: '14px', color: '#fff' }}>01号机 (iPhone 13)</strong>
                <span style={{ fontSize: '10px', color: 'var(--dsw-accent-green)', background: 'rgba(16,185,129,0.12)', padding: '2px 6px', borderRadius: '9999px', fontWeight: 'bold' }}>就绪</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)', fontFamily: 'var(--font-mono)' }}>
                代理: 美国洛杉矶 · 22ms · 100% 满电
              </div>
              <div style={{ height: '120px', background: '#000', borderRadius: '8px', margin: '12px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' }}>
                [TikTok 前台活跃 · 会话正常]
              </div>
              <div style={{ fontSize: '11px', color: '#fff', display: 'flex', gap: '6px' }}>
                <span style={{ background: 'rgba(255,255,255,0.06)', padding: '3px 6px', borderRadius: '4px' }}>🎵 @trend_cat_us</span>
              </div>
            </div>

            <div className="omx-card" onClick={() => showToast('已打开 02号机 (iPhone 13) 实时调试面板')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <strong style={{ fontSize: '14px', color: '#fff' }}>02号机 (iPhone 13)</strong>
                <span style={{ fontSize: '10px', color: 'var(--dsw-accent-green)', background: 'rgba(16,185,129,0.12)', padding: '2px 6px', borderRadius: '9999px', fontWeight: 'bold' }}>就绪</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)', fontFamily: 'var(--font-mono)' }}>
                代理: 美国洛杉矶 · 25ms · 100% 满电
              </div>
              <div style={{ height: '120px', background: '#000', borderRadius: '8px', margin: '12px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' }}>
                [相册素材选择页就绪]
              </div>
              <div style={{ fontSize: '11px', color: '#fff', display: 'flex', gap: '6px' }}>
                <span style={{ background: 'rgba(255,255,255,0.06)', padding: '3px 6px', borderRadius: '4px' }}>🎵 @beauty_tips_us</span>
              </div>
            </div>

            <div className="omx-card" onClick={() => showToast('已打开 03号机 (iPhone 13) 实时调试面板')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <strong style={{ fontSize: '14px', color: '#fff' }}>03号机 (iPhone 13)</strong>
                <span style={{ fontSize: '10px', color: 'var(--dsw-accent-rose)', background: 'rgba(244,63,94,0.12)', padding: '2px 6px', borderRadius: '9999px', fontWeight: 'bold' }}>需人工关注</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)', fontFamily: 'var(--font-mono)' }}>
                代理: 英国伦敦 · 32ms · 96% 电量
              </div>
              <div style={{ height: '120px', background: '#000', borderRadius: '8px', margin: '12px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--dsw-accent-rose)', border: '1px solid rgba(244,63,94,0.3)' }}>
                [检测到评分弹窗阻断]
              </div>
              <div style={{ fontSize: '11px', color: '#fff', display: 'flex', gap: '6px' }}>
                <span style={{ background: 'rgba(255,255,255,0.06)', padding: '3px 6px', borderRadius: '4px' }}>🎵 @pet_care_uk</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'schedules' && (
          <div style={{ background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '12px', padding: '20px' }}>
            <h3 style={{ fontSize: '15px', color: '#fff', marginBottom: '8px' }}>本周短视频自动发布排期 (周一至周日)</h3>
            <p style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', marginBottom: '16px' }}>
              自动根据目标账号所在地（美东 EST / 美西 PST / 欧洲 GMT）进行黄金流量时区对齐。
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
              {['周一 (9/15)', '周二 (9/16)', '周三 (今日)', '周四 (9/18)', '周五 (9/19)', '周六 (9/20)', '周日 (9/21)'].map((day, i) => (
                <div key={day} style={{ background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px', padding: '10px', minHeight: '240px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: i === 2 ? 'var(--dsw-accent-blue)' : '#fff', marginBottom: '8px' }}>{day}</div>
                  {i === 2 && (
                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '6px', padding: '6px', fontSize: '10px' }}>
                      <div style={{ color: 'var(--dsw-accent-blue)', fontWeight: 'bold' }}>18:00 (美东)</div>
                      <div style={{ color: '#fff' }}>@trend_cat_us</div>
                      <div style={{ color: 'var(--dsw-alias-label-tertiary)' }}>1号槽位排队</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'inspector' && (
          <div style={{ background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <strong style={{ fontSize: '14px', color: '#fff' }}>故障断点对比器 (每次异常皆有明确归因)</strong>
                <p style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }}>对比【预期控件结构】与【实际遭遇覆盖层】，支持 TypeSafe 100ms 一键自愈</p>
              </div>
              <button className="omx-btn-ink" onClick={() => showToast('TypeSafe 决策引擎已在 112 毫秒内自动识别并关闭弹窗！')}>
                执行决策引擎一键自愈
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ background: '#000', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '8px', height: '220px', padding: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--dsw-accent-green)', fontWeight: 'bold' }}>预期界面：相册九宫格选择页</span>
                <div style={{ textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)', marginTop: '60px', fontSize: '12px' }}>
                  首图无障碍属性正常 · 点击位就绪
                </div>
              </div>
              <div style={{ background: '#000', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '8px', height: '220px', padding: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--dsw-accent-rose)', fontWeight: 'bold' }}>实际界面：遭遇应用商店评分弹窗</span>
                <div style={{ textAlign: 'center', background: 'rgba(244,63,94,0.1)', padding: '10px', borderRadius: '6px', marginTop: '50px', fontSize: '12px', color: '#fff' }}>
                  “喜欢这款应用吗？请评分”
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'signing' && (
          <div style={{ background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '12px', padding: '20px' }}>
            <h3 style={{ fontSize: '15px', color: '#fff', marginBottom: '8px' }}>苹果开发者证书池管理</h3>
            <p style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', marginBottom: '14px' }}>
              通过多 Team ID 密钥横向扩展，打破单账号 100 台 UDID 上限，支持数百台真机集群。
            </p>
            <div style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px', padding: '12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ color: '#fff', fontSize: '13px' }}>团队编号: 8K2N94XYZ1 (美区矩阵主体)</strong>
                <div style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)' }}>Apple Development 证书 · 剩余 294 天</div>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--dsw-accent-green)', fontWeight: 'bold' }}>已使用 85 / 100 台设备</span>
            </div>
          </div>
        )}

        {activeTab === 'warmup' && (
          <div style={{ background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '12px', padding: '20px' }}>
            <h3 style={{ fontSize: '15px', color: '#fff', marginBottom: '8px' }}>全自主智能养号策略</h3>
            <p style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }}>
              21天渐进式提频曲线，单日 6~10 次随机巡检，模拟真人 14~18 小时作息窗口。
            </p>
          </div>
        )}
      </div>

      {toastMsg && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: 'var(--dsw-alias-bg-elevated)', border: '1px solid var(--dsw-alias-border-l3)', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', color: '#fff', zIndex: 1000, boxShadow: '0 10px 30px rgba(0,0,0,0.6)' }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}
