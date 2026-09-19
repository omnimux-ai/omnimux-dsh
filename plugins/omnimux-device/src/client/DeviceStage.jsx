import { useState, useEffect } from 'react'
import { PageHeader } from 'dsh-ui-kit'
import { injectDeviceStyles } from './styles.js'

const TAB_ID = 'omnimux-device:library'

export function DeviceStage({ t, stage, store, visible = true }) {
  const [activeTab, setActiveTab] = useState('fleet')
  const [toastMsg, setToastMsg] = useState('')
  const [activeDrawer, setActiveDrawer] = useState(null)
  const [autoHealed, setAutoHealed] = useState(false)
  const [teamKeys, setTeamKeys] = useState([
    { id: '8K2N94XYZ1', name: '美区矩阵运营团队', used: 85, days: 294 },
    { id: '3M7P21LAA9', name: '欧洲短视频矩阵团队', used: 92, days: 312 },
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
    showToast('决策引擎已在 112 毫秒内识别该系统弹窗，并自动点击「稍后再说」，页面已恢复！')
    setAutoHealed(true)
  }

  const handleAddCert = () => {
    const nextId = '9Q1B44WW' + Math.floor(Math.random() * 89 + 10)
    setTeamKeys(prev => [...prev, { id: nextId, name: '新增开发者账号', used: 0, days: 365 }])
    showToast(`新团队密钥 ${nextId} 录入成功，已扩容 100 台一年期授权配额！`)
  }

  const title = typeof t === 'function' ? t('title') : '移动真机矩阵与设备智能体中枢'
  const subtitle = typeof t === 'function' ? t('subtitle') : '本地物理真机阵列纳管，11项底层健康自检与双脑决策控制回路'

  const devices = [
    { id: 'dev-01', name: '01号机', model: 'iPhone 13', account: '@trend_cat_us', state: '就绪', proxy: '美国洛杉矶 · 22毫秒', battery: '100%' },
    { id: 'dev-02', name: '02号机', model: 'iPhone 13', account: '@beauty_tips_us', state: '就绪', proxy: '美国洛杉矶 · 25毫秒', battery: '100%' },
    { id: 'dev-03', name: '03号机', model: 'iPhone 13', account: '@pet_care_uk', state: '需人工关注', proxy: '英国伦敦 · 32毫秒', battery: '96%' },
    { id: 'dev-04', name: '04号机', model: 'iPhone 12', account: '@ootd_us', state: '预热中', proxy: '美国洛杉矶 · 21毫秒', battery: '100%' },
    { id: 'dev-05', name: '05号机', model: 'iPhone 11', account: '@daily_viral', state: '就绪', proxy: '美国洛杉矶 · 28毫秒', battery: '100%' },
    { id: 'dev-06', name: '06号机', model: 'iPhone 11', account: '@gadget_zone', state: '就绪', proxy: '美国洛杉矶 · 26毫秒', battery: '100%' },
    { id: 'dev-07', name: '07号机', model: 'iPhone 8', account: '@recipe_master', state: '就绪', proxy: '美国洛杉矶 · 30毫秒', battery: '100%' },
    { id: 'dev-08', name: '08号机', model: 'iPhone 8', account: '@humor_short', state: '就绪', proxy: '美国洛杉矶 · 31毫秒', battery: '100%' },
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
            <button className="omx-btn-subtle" onClick={() => showToast('已对全部设备重新执行 11 项健康自检，全部指标正常')}>
              全量重新体检
            </button>
            <button className="omx-btn-ink" onClick={() => showToast('请通过 USB 数据线将 iPhone 接入当前 Mac 并在手机上点击信任')}>
              + 接入新手机
            </button>
          </div>
        }
      />

      {/* 选项卡导航 (32px 基准) */}
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

      {/* 视口内容主区域 */}
      <div className="omx-stage-content">
        {/* 1. FLEET 真机大屏 */}
        {activeTab === 'fleet' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <strong style={{ fontSize: '15px', color: '#fff' }}>本地机架硬件总览 (15 台在线并发)</strong>
                <p style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }}>每台手机经由 11 项底层硬性指标严格体检认证，单机独立 Worker 进程安全隔离</p>
              </div>
              <span className="omx-badge-violet">极光紫状态探针正常</span>
            </div>

            <div className="omx-card-grid">
              {devices.map(d => (
                <div key={d.id} className="omx-fleet-card" onClick={() => setActiveDrawer(d)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div>
                      <strong style={{ fontSize: '13px', color: '#ffffff' }}>{d.name}</strong>
                      <div style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)', fontFamily: 'var(--font-mono)' }}>{d.model} · {d.proxy}</div>
                    </div>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 'bold',
                      padding: '2px 7px',
                      borderRadius: '9999px',
                      background: d.state === '就绪' ? 'rgba(16,185,129,0.12)' : d.state === '预热中' ? 'rgba(245,158,11,0.12)' : 'rgba(244,63,94,0.12)',
                      color: d.state === '就绪' ? 'var(--omx-status-green)' : d.state === '预热中' ? 'var(--omx-status-amber)' : 'var(--omx-status-rose)'
                    }}>
                      {d.state}
                    </span>
                  </div>

                  <div className="omx-mock-screen-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#fff' }}>
                      <span>09:41</span>
                      <span>{d.battery} 满电</span>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#ffffff' }}>{d.account}</div>
                      <span style={{ fontSize: '10px', color: 'var(--dsw-alias-label-tertiary)' }}>会话活跃 · 11 项体检全部达标</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--dsw-alias-label-tertiary)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '4px' }}>
                      <span>独立工作进程</span>
                      <span style={{ color: 'var(--omx-status-green)' }}>● 控制端口 8100</span>
                    </div>
                  </div>

                  <div style={{ marginTop: '10px', display: 'flex', gap: '6px' }}>
                    <span style={{ fontSize: '11px', background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '6px', padding: '2px 8px', color: 'var(--dsw-alias-label-secondary)' }}>
                      海外抖音 {d.account}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2. SCHEDULES 周历排期 */}
        {activeTab === 'schedules' && (
          <div style={{ background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <strong style={{ fontSize: '15px', color: '#fff' }}>短视频矩阵周排期日历</strong>
                <p style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }}>统一编排海外抖音与照片墙发布时段，自动对齐目标账号所在国家时区</p>
              </div>
              <button className="omx-btn-ink" onClick={() => showToast('已拉起批量发布排期任务窗口')}>+ 新增发布排期</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px', overflow: 'hidden' }}>
              {['周一 (9/15)', '周二 (9/16)', '周三 (今日)', '周四 (9/18)', '周五 (9/19)', '周六 (9/20)', '周日 (9/21)'].map((day, i) => (
                <div key={day} style={{ borderRight: i === 6 ? 'none' : '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-base)', minHeight: '340px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-2)' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: i === 2 ? '#ffffff' : 'var(--dsw-alias-label-tertiary)' }}>{day}</span>
                  </div>
                  <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                    {i === 0 && (
                      <div style={{ background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '6px', padding: '8px', fontSize: '11px' }}>
                        <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: '10px' }}>09:30 上午</div>
                        <strong style={{ color: '#fff' }}>@trend_cat_us</strong>
                        <div style={{ color: 'var(--omx-status-green)', fontSize: '10px' }}>已成功发布</div>
                      </div>
                    )}
                    {i === 2 && (
                      <div style={{ background: 'var(--dsw-alias-bg-layer-3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '8px', fontSize: '11px' }}>
                        <div style={{ color: '#ffffff', fontSize: '10px', fontWeight: 'bold' }}>18:00 (美东)</div>
                        <strong style={{ color: '#fff' }}>@trend_cat_us</strong>
                        <div style={{ color: '#ffffff', fontSize: '10px' }}>排队中 · 1号槽位</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. INSPECTOR 故障对比器 */}
        {activeTab === 'inspector' && (
          <div style={{ background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '12px', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <strong style={{ fontSize: '15px', color: '#fff' }}>故障断点对比器 (每次异常皆有明确归因)</strong>
                <p style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }}>拒绝无响应假死。系统准确指出预期看到的界面结构，以及实际遭遇的异常干扰层</p>
              </div>
              <button className="omx-btn-ink" onClick={handleAutoHeal}>
                执行决策引擎智能自愈
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--omx-status-green)', fontWeight: 'bold' }}>预期界面结构：系统相册九宫格</span>
                <div style={{ background: '#000', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '8px', height: '260px', padding: '14px', marginTop: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '10px', color: 'var(--dsw-alias-label-tertiary)' }}>相册最近项目</span>
                  <div style={{ textAlign: 'center', color: 'var(--dsw-alias-label-secondary)', fontSize: '12px' }}>
                    [视频首图正常可见 · 点击就绪]
                  </div>
                  <span style={{ fontSize: '10px', textAlign: 'right', color: 'var(--dsw-alias-label-tertiary)' }}>下一步按钮 [可用]</span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: autoHealed ? 'var(--omx-status-green)' : 'var(--omx-status-rose)', fontWeight: 'bold' }}>
                  {autoHealed ? '实际画面检测：弹窗已自愈关闭' : '实际画面检测：遭遇第三方应用评分弹窗'}
                </span>
                <div style={{ background: '#000', border: autoHealed ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(244,63,94,0.3)', borderRadius: '8px', height: '260px', padding: '14px', marginTop: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '10px', color: 'var(--dsw-alias-label-tertiary)' }}>系统覆盖层</span>
                  {autoHealed ? (
                    <div style={{ textAlign: 'center', color: 'var(--omx-status-green)', fontSize: '12px', fontWeight: 'bold' }}>
                      ✔ 弹窗已由决策引擎自动关闭<br />
                      <span style={{ color: '#fff', fontSize: '11px', fontWeight: 'normal' }}>已自动推进至「下一步」完成短视频发布</span>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', background: 'rgba(244,63,94,0.08)', padding: '14px', borderRadius: '6px' }}>
                      <strong style={{ color: '#fff', fontSize: '12px' }}>喜欢这款应用吗？</strong><br />
                      <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: '11px' }}>请前往应用商店为我们评分</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--dsw-alias-label-secondary)' }}>
                    <span style={{ color: 'var(--omx-status-amber)' }}>稍后再说</span>
                    <span>提交</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. SIGNING 证书管理 */}
        {activeTab === 'signing' && (
          <div style={{ background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <strong style={{ fontSize: '15px', color: '#fff' }}>苹果开发者证书池管理</strong>
                <p style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }}>物理真机必须签名方可运行控制程序。通过多证书密钥池横向扩展，轻松纳管数百台 iPhone</p>
              </div>
              <button className="omx-btn-ink" onClick={handleAddCert}>+ 导入新团队密钥 (.p8)</button>
            </div>

            {teamKeys.map(k => (
              <div key={k.id} style={{ background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px', padding: '14px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ color: '#fff', fontSize: '13px' }}>团队编号: {k.id} ({k.name})</strong>
                  <div style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)' }}>Apple Development 证书 · 剩余 {k.days} 天</div>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--omx-status-green)', fontWeight: 'bold' }}>已使用 {k.used} / 100 台设备</span>
              </div>
            ))}
          </div>
        )}

        {/* 5. WARMUP 自动养号 */}
        {activeTab === 'warmup' && (
          <div style={{ background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '12px', padding: '20px' }}>
            <strong style={{ fontSize: '15px', color: '#fff' }}>全自主智能养号策略</strong>
            <p style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', marginBottom: '16px' }}>
              一次设定，全天候由 Mac 本地引擎自动执行，支持 21 天渐进式提频曲线与真人作息窗口。
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div style={{ background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', padding: '16px', borderRadius: '8px' }}>
                <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' }}>单日访问频次</span>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ffffff', marginTop: '4px' }}>6 ~ 10 轮随机巡检</div>
              </div>
              <div style={{ background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', padding: '16px', borderRadius: '8px' }}>
                <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' }}>新号权重爬坡期</span>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ffffff', marginTop: '4px' }}>21 天防风控渐进曲线</div>
              </div>
              <div style={{ background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', padding: '16px', borderRadius: '8px' }}>
                <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' }}>单日活跃时间窗</span>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ffffff', marginTop: '4px' }}>14 ~ 18 小时真人作息</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 侧边 11 项体检抽屉 */}
      <div className={`omx-drawer-mask ${activeDrawer ? 'active' : ''}`} onClick={() => setActiveDrawer(null)}>
        {activeDrawer && (
          <div className="omx-drawer-panel" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff' }}>{activeDrawer.name} ({activeDrawer.model})</h3>
                <span style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)', fontFamily: 'var(--font-mono)' }}>{activeDrawer.proxy}</span>
              </div>
              <button className="omx-btn-subtle" style={{ height: '26px', padding: '0 8px' }} onClick={() => setActiveDrawer(null)}>
                关闭
              </button>
            </div>

            <div style={{ background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '8px', padding: '12px' }}>
              <strong style={{ fontSize: '12px', color: '#fff' }}>初始化步序检查</strong>
              <div style={{ fontSize: '12px', color: 'var(--omx-status-green)', marginTop: '6px' }}>✔ 物理设备 USB 连接就绪</div>
              <div style={{ fontSize: '12px', color: 'var(--omx-status-green)', marginTop: '4px' }}>✔ 已分配专属社媒账号 ({activeDrawer.account})</div>
              <div style={{ fontSize: '12px', color: 'var(--omx-status-green)', marginTop: '4px' }}>✔ 控制守护程序已完成证书签名</div>
              <div style={{ fontSize: '12px', color: 'var(--omx-status-green)', marginTop: '4px' }}>✔ 自动养号巡检队列已就绪</div>
            </div>

            <div>
              <strong style={{ fontSize: '12px', color: '#fff', display: 'block', marginBottom: '8px' }}>11 项底层硬性指标健康体检</strong>
              {['开发者模式状态: 已开启', '界面自动化权限: 已就绪', '系统浅色外观: 符合标准', '屏幕自动锁定: 永不锁屏', '锁屏密码状态: 自动解锁已配置', '减少动态效果: 已启用', '待机显示模式: 已关闭', '自动亮度调节: 已关闭', '云端照片同步: 已关闭 (防关联)', '独占住宅静态代理: 连通正常', '电池电量与机身温度: 100% · 31.5°C 正常'].map(item => (
                <div key={item} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' }}>
                  <span>{item.split(':')[0]}</span>
                  <span style={{ color: 'var(--omx-status-green)', fontWeight: 'bold' }}>✔ {item.split(':')[1]}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button className="omx-btn-subtle" style={{ flex: 1 }} onClick={() => showToast('已对该 iPhone 重新执行 11 项体检')}>重新体检该设备</button>
              <button className="omx-btn-ink" style={{ flex: 1 }} onClick={() => showToast('已向手机发送点按加号指令')}>模拟点击加号</button>
            </div>
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
