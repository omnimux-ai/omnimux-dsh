import { useState, useEffect } from 'react'
import { PageHeader } from 'dsh-ui-kit'
import { injectDeviceStyles } from './styles.js'

const TAB_ID = 'omnimux-device:library'

// 纯矢量 SVG 图标定义 (UI04 硬门禁：零 Emoji、零特殊字符)
const ICONS = {
  refresh: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
    </svg>
  ),
  plus: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  battery: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="16" height="10" rx="2" ry="2"/>
      <line x1="22" y1="11" x2="22" y2="13"/>
    </svg>
  ),
  signal: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
      <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
      <line x1="12" y1="20" x2="12.01" y2="20"/>
    </svg>
  ),
  tiktok: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
    </svg>
  ),
}

export function DeviceStage({ t, stage, store, visible = true }) {
  const [activeTab, setActiveTab] = useState('fleet')
  const [toastMsg, setToastMsg] = useState('')
  const [activeDrawer, setActiveDrawer] = useState(null)
  const [autoHealed, setAutoHealed] = useState(false)
  const [teamKeys, setTeamKeys] = useState([
    { id: '8K2N94XYZ1', name: '美区运营组', used: 85, days: 294 },
    { id: '3M7P21LAA9', name: '欧洲运营组', used: 92, days: 312 },
  ])

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
    setTimeout(() => setToastMsg(''), 2200)
  }

  const handleAutoHeal = () => {
    showToast('决策引擎已于 112 毫秒内自动识别并关闭弹窗')
    setAutoHealed(true)
  }

  const handleAddCert = () => {
    const nextId = '9Q1B44WW' + Math.floor(Math.random() * 89 + 10)
    setTeamKeys(prev => [...prev, { id: nextId, name: '新开发者账号', used: 0, days: 365 }])
    showToast(`新团队密钥 ${nextId} 录入成功 (+100台)`)
  }

  const title = typeof t === 'function' ? t('title') : '手机管理'
  const subtitle = typeof t === 'function' ? t('subtitle') : '物理集群 · 15台就绪'

  const devices = [
    { id: 'dev-01', name: '01号机', model: 'iPhone 13', account: '@trend_cat_us', state: '就绪', proxy: '洛杉矶 · 22ms', battery: '100%' },
    { id: 'dev-02', name: '02号机', model: 'iPhone 13', account: '@beauty_tips_us', state: '就绪', proxy: '洛杉矶 · 25ms', battery: '100%' },
    { id: 'dev-03', name: '03号机', model: 'iPhone 13', account: '@pet_care_uk', state: '异常', proxy: '伦敦 · 32ms', battery: '96%' },
    { id: 'dev-04', name: '04号机', model: 'iPhone 12', account: '@ootd_us', state: '预热', proxy: '洛杉矶 · 21ms', battery: '100%' },
    { id: 'dev-05', name: '05号机', model: 'iPhone 11', account: '@daily_viral', state: '就绪', proxy: '洛杉矶 · 28ms', battery: '100%' },
    { id: 'dev-06', name: '06号机', model: 'iPhone 11', account: '@gadget_zone', state: '就绪', proxy: '洛杉矶 · 26ms', battery: '100%' },
    { id: 'dev-07', name: '07号机', model: 'iPhone 8', account: '@recipe_master', state: '就绪', proxy: '洛杉矶 · 30ms', battery: '100%' },
    { id: 'dev-08', name: '08号机', model: 'iPhone 8', account: '@humor_short', state: '就绪', proxy: '洛杉矶 · 31ms', battery: '100%' },
  ]

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
            <button className="omx-btn-subtle" onClick={() => showToast('已完成全量设备 11 项指标健康自检')}>
              {ICONS.refresh}
              <span>刷新体检</span>
            </button>
            <button className="omx-btn-ink" onClick={() => showToast('请将 iPhone 接入 USB 并点击手机信任')}>
              {ICONS.plus}
              <span>接入设备</span>
            </button>
          </div>
        }
      />

      {/* 极简选项卡导航 (32px 基准，单行流) */}
      <div className="omx-stage-tabs">
        <button className={`omx-stage-tab-btn ${activeTab === 'fleet' ? 'active' : ''}`} onClick={() => setActiveTab('fleet')}>
          集群
        </button>
        <button className={`omx-stage-tab-btn ${activeTab === 'schedules' ? 'active' : ''}`} onClick={() => setActiveTab('schedules')}>
          排期
        </button>
        <button className={`omx-stage-tab-btn ${activeTab === 'inspector' ? 'active' : ''}`} onClick={() => setActiveTab('inspector')}>
          诊断
        </button>
        <button className={`omx-stage-tab-btn ${activeTab === 'signing' ? 'active' : ''}`} onClick={() => setActiveTab('signing')}>
          证书
        </button>
        <button className={`omx-stage-tab-btn ${activeTab === 'warmup' ? 'active' : ''}`} onClick={() => setActiveTab('warmup')}>
          养号
        </button>
      </div>

      {/* 视口内容主区域 */}
      <div className="omx-stage-content">
        {/* 1. 集群视图 (Fleet) */}
        {activeTab === 'fleet' && (
          <div className="omx-card-grid">
            {devices.map(d => (
              <div key={d.id} className="omx-fleet-card" onClick={() => setActiveDrawer(d)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: d.state === '就绪' ? 'var(--omx-status-green)' : d.state === '预热' ? 'var(--omx-status-amber)' : 'var(--omx-status-rose)'
                    }} />
                    <strong style={{ fontSize: '13px', color: '#ffffff' }}>{d.name}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)', fontFamily: 'var(--font-mono)' }}>{d.model}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {ICONS.signal}
                    <span>{d.proxy}</span>
                  </span>
                </div>

                <div className="omx-mock-screen-box">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--dsw-alias-label-tertiary)' }}>
                    <span>09:41</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      {ICONS.battery}
                      <span>{d.battery}</span>
                    </span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      {ICONS.tiktok}
                      <span>{d.account}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--dsw-alias-label-tertiary)' }}>
                    <span>端口 8100</span>
                    <span style={{ color: d.state === '就绪' ? 'var(--omx-status-green)' : 'var(--omx-status-rose)' }}>{d.state}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 2. 排期视图 (Schedules) */}
        {activeTab === 'schedules' && (
          <div style={{ background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <strong style={{ fontSize: '14px', color: '#fff' }}>本周排期 (周一至周日)</strong>
              <button className="omx-btn-ink" onClick={() => showToast('已打开排期创建弹窗')}>
                {ICONS.plus}
                <span>新建排期</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px', overflow: 'hidden' }}>
              {['一', '二', '三', '四', '五', '六', '日'].map((day, i) => (
                <div key={day} style={{ borderRight: i === 6 ? 'none' : '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-base)', minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-2)' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: i === 2 ? '#ffffff' : 'var(--dsw-alias-label-tertiary)' }}>周{day}</span>
                  </div>
                  <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                    {i === 0 && (
                      <div style={{ background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '6px', padding: '6px', fontSize: '11px' }}>
                        <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: '10px' }}>09:30</div>
                        <strong style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: '3px' }}>{ICONS.tiktok} @trend_cat_us</strong>
                        <div style={{ color: 'var(--omx-status-green)', fontSize: '10px' }}>已发布</div>
                      </div>
                    )}
                    {i === 2 && (
                      <div style={{ background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '6px', padding: '6px', fontSize: '11px' }}>
                        <div style={{ color: '#ffffff', fontSize: '10px', fontWeight: 'bold' }}>18:00</div>
                        <strong style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: '3px' }}>{ICONS.tiktok} @trend_cat_us</strong>
                        <div style={{ color: '#ffffff', fontSize: '10px' }}>排队中 · 1号槽</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. 诊断视图 (Inspector) */}
        {activeTab === 'inspector' && (
          <div style={{ background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '12px', padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <strong style={{ fontSize: '14px', color: '#ffffff' }}>工单 #412 · 03号机 (iPhone 13)</strong>
                <div style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)' }}>步骤：相册选择素材</div>
              </div>
              <button className="omx-btn-ink" onClick={handleAutoHeal}>
                决策自愈
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--omx-status-green)', fontWeight: 'bold', marginBottom: '6px' }}>预期</div>
                <div style={{ background: '#000', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px', height: '220px', padding: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '10px', color: 'var(--dsw-alias-label-tertiary)' }}>相册九宫格</span>
                  <div style={{ textAlign: 'center', color: 'var(--dsw-alias-label-secondary)', fontSize: '11px' }}>首图可见 · 坐标正常</div>
                  <span style={{ fontSize: '10px', textAlign: 'right', color: 'var(--dsw-alias-label-tertiary)' }}>下一步</span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: autoHealed ? 'var(--omx-status-green)' : 'var(--omx-status-rose)', fontWeight: 'bold', marginBottom: '6px' }}>
                  {autoHealed ? '实际 (自愈)' : '实际 (遭遇评分弹窗)'}
                </div>
                <div style={{ background: '#000', border: autoHealed ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(244,63,94,0.35)', borderRadius: '8px', height: '220px', padding: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '10px', color: 'var(--dsw-alias-label-tertiary)' }}>覆盖层</span>
                  {autoHealed ? (
                    <div style={{ textAlign: 'center', color: 'var(--omx-status-green)', fontSize: '12px', fontWeight: 'bold' }}>
                      弹窗已自动关闭 · 任务继续
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', background: 'rgba(244,63,94,0.08)', padding: '12px', borderRadius: '6px' }}>
                      <strong style={{ color: '#fff', fontSize: '11px' }}>应用评分弹窗</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--dsw-alias-label-tertiary)' }}>
                    <span>稍后再说</span>
                    <span>提交</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. 证书视图 (Signing) */}
        {activeTab === 'signing' && (
          <div style={{ background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '12px', padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <strong style={{ fontSize: '14px', color: '#fff' }}>开发者证书池</strong>
              <button className="omx-btn-ink" onClick={handleAddCert}>
                {ICONS.plus}
                <span>导入密钥 (.p8)</span>
              </button>
            </div>

            {teamKeys.map(k => (
              <div key={k.id} style={{ background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px', padding: '12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ color: '#fff', fontSize: '12px' }}>{k.id} ({k.name})</strong>
                  <div style={{ fontSize: '10px', color: 'var(--dsw-alias-label-tertiary)' }}>剩余 {k.days} 天</div>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--omx-status-green)', fontWeight: 'bold' }}>{k.used} / 100 台</span>
              </div>
            ))}
          </div>
        )}

        {/* 5. 养号视图 (Warmup) */}
        {activeTab === 'warmup' && (
          <div style={{ background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '12px', padding: '18px' }}>
            <strong style={{ fontSize: '14px', color: '#fff' }}>自主养号策略</strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '12px' }}>
              <div style={{ background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', padding: '12px', borderRadius: '8px' }}>
                <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px' }}>单日频次</span>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#fff', marginTop: '3px' }}>6 ~ 10 次</div>
              </div>
              <div style={{ background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', padding: '12px', borderRadius: '8px' }}>
                <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px' }}>爬坡周期</span>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#fff', marginTop: '3px' }}>21 天</div>
              </div>
              <div style={{ background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', padding: '12px', borderRadius: '8px' }}>
                <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px' }}>活跃时间</span>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#fff', marginTop: '3px' }}>14 ~ 18 小时</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 侧边体检抽屉 */}
      <div className={`omx-drawer-mask ${activeDrawer ? 'active' : ''}`} onClick={() => setActiveDrawer(null)}>
        {activeDrawer && (
          <div className="omx-drawer-panel" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: '14px', color: '#fff' }}>{activeDrawer.name} ({activeDrawer.model})</strong>
                <div style={{ fontSize: '10px', color: 'var(--dsw-alias-label-tertiary)' }}>{activeDrawer.proxy}</div>
              </div>
              <button className="omx-btn-subtle" style={{ height: '26px', padding: '0 8px' }} onClick={() => setActiveDrawer(null)}>关闭</button>
            </div>

            <div style={{ background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px', padding: '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--omx-status-green)' }}>✔ USB 物理就绪</div>
              <div style={{ fontSize: '11px', color: 'var(--omx-status-green)', marginTop: '3px' }}>✔ 账号绑定: {activeDrawer.account}</div>
              <div style={{ fontSize: '11px', color: 'var(--omx-status-green)', marginTop: '3px' }}>✔ 守护签名正常</div>
            </div>

            <div>
              <strong style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)', display: 'block', marginBottom: '6px' }}>11 项体检状态</strong>
              {['开发者模式: 开启', '自动化权限: 就绪', '外观模式: 浅色', '自动锁定: 永不', '锁屏密码: 已配置', '减少动态效果: 开启', '待机模式: 关闭', '自动亮度: 关闭', '云端照片: 关闭', '住宅代理: 连通', '电池温度: 正常'].map(item => (
                <div key={item} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)', fontSize: '11px', color: 'var(--dsw-alias-label-secondary)' }}>
                  <span>{item.split(':')[0]}</span>
                  <span style={{ color: 'var(--omx-status-green)', fontWeight: 'bold' }}>✔ {item.split(':')[1]}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button className="omx-btn-subtle" style={{ flex: 1 }} onClick={() => showToast('体检复核完成')}>重新体检</button>
              <button className="omx-btn-ink" style={{ flex: 1 }} onClick={() => showToast('已模拟点击加号')}>模拟点按</button>
            </div>
          </div>
        )}
      </div>

      {toastMsg && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: 'var(--dsw-alias-bg-elevated)', border: '1px solid var(--dsw-alias-border-l2)', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', color: '#fff', zIndex: 1000 }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}
