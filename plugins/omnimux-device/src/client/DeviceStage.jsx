import { useState, useEffect } from 'react'
import { PageHeader } from 'dsh-ui-kit'
import { injectDeviceStyles } from './styles.js'

const TAB_ID = 'omnimux-device:library'

// 纯矢量 SVG 图标定义 (UI04 硬门禁：零 Emoji、零特殊字符)
const ICONS = {
  refresh: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
    </svg>
  ),
  plus: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  battery: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="16" height="10" rx="2" ry="2"/>
      <line x1="22" y1="11" x2="22" y2="13"/>
    </svg>
  ),
  signal: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
      <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
      <line x1="12" y1="20" x2="12.01" y2="20"/>
    </svg>
  ),
  tiktok: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
    </svg>
  ),
  shield: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  check: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  close: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  forbid: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
    </svg>
  ),
  externalLink: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  ),
}

export function DeviceStage({ t, stage, store, visible = true }) {
  const [activeTab, setActiveTab] = useState('fleet')
  const [toastMsg, setToastMsg] = useState('')
  const [activeDrawer, setActiveDrawer] = useState(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [whitelistOpen, setWhitelistOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [signOption, setSignOption] = useState('team') // 'team' | 'free'
  const [scheduleView, setScheduleView] = useState('calendar') // 'calendar' | 'list'
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false)
  const [contentSearch, setContentSearch] = useState('')

  // 排期新建表单状态
  const [formPlatform, setFormPlatform] = useState('TikTok')
  const [formAccount, setFormAccount] = useState('@trend_cat_us')
  const [formAction, setFormAction] = useState('发布短视频')
  const [formCaption, setFormCaption] = useState('')
  const [formTime, setFormTime] = useState('18:00')

  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [currentReceipt, setCurrentReceipt] = useState(null)

  // 排期规划管线 (Schedule Pipeline) 任务列表：支持双时区智能对齐与线上发帖回执
  const [scheduledPosts, setScheduledPosts] = useState([
    {
      id: 'post-01',
      day: '周一',
      time: '19:30',
      tzTag: '美西 19:30 · 黄金档',
      localSub: '北京次日 10:30',
      title: '美区搞笑猫咪·抓拍合辑',
      account: '@trend_cat_us',
      platform: 'TikTok',
      action: '发布短视频',
      state: '已履约发布',
      receipt: {
        url: 'https://www.tiktok.com/@trend_cat_us/video/738291048129',
        metrics: '14.8k 播放 · 2.1k 赞',
      },
    },
    {
      id: 'post-02',
      day: '周三',
      time: '18:00',
      tzTag: '美东 18:00 · 晚高峰',
      localSub: '北京周四 06:00',
      title: '厨房收纳神器爆款复刻',
      account: '@trend_cat_us',
      platform: 'TikTok',
      action: '发布短视频',
      state: '排期锁定中 · 1号槽',
    },
  ])

  // 矩阵账号拓扑 (Account Topology)：安全发布配额与健康权重指数感知
  const [matrixAccounts] = useState([
    {
      id: 'acc-01',
      handle: '@trend_cat_us',
      platform: 'TikTok 美区',
      tzDesc: '洛杉矶时区 (UTC-8) · 萌宠搞笑垂类',
      healthScore: '96分',
      healthLabel: '权重极佳',
      quotaText: '已发 1 / 上限 3 条 (安全)',
      quotaPercent: 33,
      isWarning: false,
      hardware: 'iPhone 15 Pro (01号机)',
    },
    {
      id: 'acc-02',
      handle: '@ootd_style_us',
      platform: 'Instagram',
      tzDesc: '纽约时区 (UTC-5) · 时尚穿搭垂类',
      healthScore: '88分',
      healthLabel: '健康良好',
      quotaText: '已发 2 / 上限 2 条 (满额预警)',
      quotaPercent: 100,
      isWarning: true,
      hardware: 'iPhone 14 (02号机)',
    },
    {
      id: 'acc-03',
      handle: '@life_hacks_global',
      platform: 'YouTube Shorts',
      tzDesc: '伦敦时区 (UTC+0) · 生活黑科技类',
      healthScore: '94分',
      healthLabel: '权重优良',
      quotaText: '已发 0 / 上限 3 条 (空闲就绪)',
      quotaPercent: 0,
      isWarning: false,
      hardware: 'iPhone 13 (04号机)',
    },
  ])

  // 资产就绪货架 (Asset Inventory)：直通资产库成片、防重发排他锁状态机
  const [assetInventory] = useState([
    {
      id: 'ast-01',
      title: '美区搞笑猫咪·抓拍合辑',
      meta: '00:32 · 9:16竖屏 · TikTok成片',
      state: 'fulfilled', // fulfilled | locked | ready
      stateLabel: '已履约发布 · 锁定',
      targetAccount: '@trend_cat_us',
      receiptUrl: 'https://www.tiktok.com/@trend_cat_us/video/738291048129',
    },
    {
      id: 'ast-02',
      title: '厨房收纳神器爆款复刻',
      meta: '00:45 · 9:16竖屏 · 口播脚本对齐',
      state: 'locked',
      stateLabel: '排期锁定中',
      targetAccount: '@trend_cat_us',
      scheduleTime: '今日 18:00',
    },
    {
      id: 'ast-03',
      title: '美白精华淡斑实测测评',
      meta: '00:28 · 9:16竖屏 · AI特征提取完成',
      state: 'ready',
      stateLabel: '就绪待分发',
    },
    {
      id: 'ast-04',
      title: '车载香薰出海爆单视频',
      meta: '00:39 · 9:16竖屏 · 英文TTS解说',
      state: 'ready',
      stateLabel: '就绪待分发',
    },
  ])

  // 保活契约（Stage contract）：页面切走时隐藏而不卸载，回来时不重拉状态。
  const [everOpened, setEverOpened] = useState(false)
  useEffect(() => { if (visible) setEverOpened(true) }, [visible])

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

  const handleCreatePost = (e) => {
    e?.preventDefault?.()
    if (!formCaption.trim()) {
      showToast('请输入发布文案或标签')
      return
    }
    const newPost = {
      id: `post-${Date.now()}`,
      day: '周四',
      time: formTime || '18:00',
      account: formAccount,
      action: formAction,
      state: '已排期 · 待触发',
    }
    setScheduledPosts(prev => [...prev, newPost])
    setScheduleFormOpen(false)
    setFormCaption('')
    showToast(`已成功为 ${formAccount} 创建发布任务`)
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

  if (!visible && !everOpened) return null

  return (
    <div
      role="region"
      aria-label={title}
      aria-hidden={visible ? undefined : 'true'}
      className="omnimux-device-stage"
      style={visible ? undefined : { display: 'none' }}
    >
      <PageHeader
        title={title}
        subtitle={subtitle}
        onClose={handleClose}
        actions={
          <div className="omx-banner-actions">
            <button className="omx-btn-subtle" onClick={() => showToast('已完成全量设备 11 项指标健康自检')} /* exempt-ui01 极简自检按钮 */>
              {ICONS.refresh}
              <span>刷新体检</span>
            </button>
            <button className="omx-btn-ink" onClick={() => setWizardOpen(true)} /* exempt-ui01 Ink CTA 接入按钮 */>
              {ICONS.plus}
              <span>接入设备</span>
            </button>
          </div>
        }
      />

      {/* 顶部全局连接与安全状态条 */}
      <div className="omx-global-banner">
        <div className="omx-banner-left">
          <span className="omx-banner-dot" />
          <span className="omx-banner-text">Mac 执行中枢待命 · 打开桌面端后将自动流式同步设备与会话状态</span>
        </div>
        <div className="omx-banner-right">
          <button className="omx-btn-subtle omx-btn-sm" onClick={() => setWhitelistOpen(true)} /* exempt-ui01 权限白名单弹层入口 */>
            {ICONS.shield}
            <span>AI 权限白名单</span>
          </button>
        </div>
      </div>

      {/* 极简选项卡导航 (32px 基准，单行流，SaaS 科技化术语规范) */}
      <div className="omx-stage-tabs">
        <button className={`omx-stage-tab-btn ${activeTab === 'fleet' ? 'active' : ''}`} onClick={() => setActiveTab('fleet')} /* exempt-ui01 选项卡导航 */>
          集群监控
        </button>
        <button className={`omx-stage-tab-btn ${activeTab === 'schedules' ? 'active' : ''}`} onClick={() => setActiveTab('schedules')} /* exempt-ui01 选项卡导航 */>
          排期管线
        </button>
        <button className={`omx-stage-tab-btn ${activeTab === 'content' ? 'active' : ''}`} onClick={() => setActiveTab('content')} /* exempt-ui01 选项卡导航 */>
          素材就绪
        </button>
        <button className={`omx-stage-tab-btn ${activeTab === 'accounts' ? 'active' : ''}`} onClick={() => setActiveTab('accounts')} /* exempt-ui01 选项卡导航 */>
          账号拓扑
        </button>
        <button className={`omx-stage-tab-btn ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')} /* exempt-ui01 选项卡导航 */>
          会话审计
        </button>
        <button className={`omx-stage-tab-btn ${activeTab === 'warmup' ? 'active' : ''}`} onClick={() => setActiveTab('warmup')} /* exempt-ui01 选项卡导航 */>
          养号计划
        </button>
      </div>

      {/* 视口内容主区域 */}
      <div className="omx-stage-content">
        {/* 1. 集群视图 (Fleet)：iPhone 真机比例 + 外壳 */}
        {activeTab === 'fleet' && (
          <div className="omx-phone-grid">
            {devices.map(d => {
              const stateClass = d.state === '就绪' ? 'ready' : d.state === '预热' ? 'warm' : 'error'
              return (
                <div key={d.id} className="omx-phone-card" onClick={() => setActiveDrawer(d)} role="button" aria-label={`${d.name} ${d.model} ${d.state}`}>
                  <div className="omx-phone-frame">
                    <div className="omx-phone-screen">
                      <div className="omx-phone-island" />
                      <div className="omx-phone-statusbar">
                        <span>09:41</span>
                        <span className="omx-phone-battery">
                          {ICONS.battery}
                          <span>{d.battery}</span>
                        </span>
                      </div>
                      <div className="omx-phone-body">
                        <div className="omx-phone-account">
                          {ICONS.tiktok}
                          <span>{d.account}</span>
                        </div>
                        <span className={`omx-phone-state ${stateClass}`}>{d.state}</span>
                      </div>
                      <div className="omx-phone-footer">
                        <span className="omx-phone-port">端口 8100</span>
                        <span className="omx-phone-home" />
                      </div>
                    </div>
                  </div>
                  <div className="omx-phone-caption">
                    <span className={`omx-phone-dot ${stateClass}`} />
                    <strong>{d.name}</strong>
                    <span className="omx-phone-model">{d.model}</span>
                    <span className="omx-phone-proxy">
                      {ICONS.signal}
                      <span>{d.proxy}</span>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 2. 排期视图 (Schedules)：日历 / 列表双视图 + 任务表单 */}
        {activeTab === 'schedules' && (
          <div>
            <div className="omx-schedule-toolbar">
              <div className="omx-banner-left">
                <div className="omx-view-toggle">
                  <button className={`omx-view-toggle-btn ${scheduleView === 'calendar' ? 'active' : ''}`} onClick={() => setScheduleView('calendar')} /* exempt-ui01 视图切换开关 */>
                    日历视图
                  </button>
                  <button className={`omx-view-toggle-btn ${scheduleView === 'list' ? 'active' : ''}`} onClick={() => setScheduleView('list')} /* exempt-ui01 视图切换开关 */>
                    列表视图
                  </button>
                </div>
                <span className="omx-section-desc">本周任务规划 · 素材仅在执行时按需下发至对应真机</span>
              </div>
              <button className="omx-btn-ink" onClick={() => setScheduleFormOpen(prev => !prev)} /* exempt-ui01 表单展开控制 */>
                {ICONS.plus}
                <span>{scheduleFormOpen ? '收起新建' : '新建任务'}</span>
              </button>
            </div>

            {/* 新建任务表单 (内联展开) */}
            {scheduleFormOpen && (
              <form className="omx-inline-form" onSubmit={handleCreatePost}>
                <div className="omx-form-row">
                  <div className="omx-form-field">
                    <span className="omx-form-label">发布平台</span>
                    <select className="omx-input" value={formPlatform} onChange={e => setFormPlatform(e.target.value)} /* exempt-ui01 五字段表单平台选择 */>
                      <option value="TikTok">TikTok (海外抖音)</option>
                      <option value="Instagram">Instagram (照片墙)</option>
                      <option value="YouTube">YouTube Shorts</option>
                    </select>
                  </div>
                  <div className="omx-form-field">
                    <span className="omx-form-label">目标账号</span>
                    <select className="omx-input" value={formAccount} onChange={e => setFormAccount(e.target.value)} /* exempt-ui01 五字段表单账号选择 */>
                      <option value="@trend_cat_us">@trend_cat_us (01号机)</option>
                      <option value="@beauty_tips_us">@beauty_tips_us (02号机)</option>
                      <option value="@ootd_us">@ootd_us (04号机)</option>
                    </select>
                  </div>
                  <div className="omx-form-field">
                    <span className="omx-form-label">执行动作</span>
                    <select className="omx-input" value={formAction} onChange={e => setFormAction(e.target.value)} /* exempt-ui01 五字段表单动作选择 */>
                      <option value="发布短视频">发布短视频</option>
                      <option value="定时养号">智能养号与互动</option>
                      <option value="评论回复">粉丝评论批量回复</option>
                    </select>
                  </div>
                  <div className="omx-form-field">
                    <span className="omx-form-label">计划时间</span>
                    <input className="omx-input" type="text" value={formTime} onChange={e => setFormTime(e.target.value)} placeholder="如 18:00" />
                  </div>
                </div>
                <div className="omx-form-field">
                  <span className="omx-form-label">文案与标签 (#hashtag)</span>
                  <input className="omx-input" type="text" value={formCaption} onChange={e => setFormCaption(e.target.value)} placeholder="输入准备发布的配文与热门话题，执行时自动注入剪贴板" />
                </div>
                <div className="omx-drawer-actions">
                  <button type="submit" className="omx-btn-ink" /* exempt-ui01 确认提交 */>确认创建</button>
                  <button type="button" className="omx-btn-subtle" onClick={() => setScheduleFormOpen(false)} /* exempt-ui01 取消表单 */>取消</button>
                </div>
              </form>
            )}

            {/* 日历视图 */}
            {scheduleView === 'calendar' && (
              <div className="omx-week-grid">
                {['一', '二', '三', '四', '五', '六', '日'].map(day => (
                  <div key={day} className="omx-day-col">
                    <div className="omx-day-head">
                      <span>周{day}</span>
                      <button className="omx-day-add-btn" title="添加任务" onClick={() => { setScheduleFormOpen(true); showToast(`已就绪：为周${day}添加排期`) }} /* exempt-ui01 周添加按钮 */>+</button>
                    </div>
                    <div className="omx-day-body">
                      {scheduledPosts.filter(p => p.day.includes(day)).map(p => (
                        <div key={p.id} className="omx-schedule-card">
                          <div className="omx-timezone-pill">{p.tzTag || p.time}</div>
                          {p.localSub && <div className="omx-time-sub">{p.localSub}</div>}
                          {p.title && <div className="omx-card-asset-title">{p.title}</div>}
                          <div className="omx-schedule-card-acc">{ICONS.tiktok} {p.account}</div>
                          <div className="omx-card-status-bar">
                            <span className="omx-schedule-card-tag">{p.state}</span>
                            {p.receipt && (
                              <button type="button" className="omx-btn-receipt" onClick={(e) => { e.stopPropagation(); setCurrentReceipt({ ...p.receipt, title: p.title, account: p.account, time: p.tzTag }); setReceiptModalOpen(true) }} /* exempt-ui01 回执查看按钮 */>
                                <span>回执</span>
                                {ICONS.externalLink}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 列表视图 */}
            {scheduleView === 'list' && (
              <div className="omx-section-card">
                <table className="omx-data-table">
                  <thead>
                    <tr>
                      <th>时间与时区</th>
                      <th>成片标题</th>
                      <th>目标账号</th>
                      <th>动作</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduledPosts.map(p => (
                      <tr key={p.id}>
                        <td>{p.day} {p.tzTag || p.time}</td>
                        <td>{p.title || '无标题成片'}</td>
                        <td>{p.account}</td>
                        <td>{p.action}</td>
                        <td><span className="omx-badge-violet">{p.state}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 3. 素材视图 (Content)：资产就绪货架与防重发排他锁 */}
        {activeTab === 'content' && (
          <div>
            <div className="omx-content-toolbar">
              <div className="omx-search-box">
                <input
                  className="omx-input"
                  type="text"
                  placeholder="搜索素材标题或标签..."
                  value={contentSearch}
                  onChange={e => setContentSearch(e.target.value)}
                />
              </div>
              <div className="omx-banner-actions">
                <button className="omx-btn-subtle" onClick={() => showToast('已同步拉取 OmniMux 资产库最新成片')} /* exempt-ui01 同步资产库 */>
                  {ICONS.refresh}
                  <span>同步资产库</span>
                </button>
                <button className="omx-btn-ink" onClick={() => { setActiveTab('schedules'); setScheduleFormOpen(true); showToast('已直通排期管线，请挑选目标账号与黄金发布窗口') }} /* exempt-ui01 直通排期管线 */>
                  {ICONS.plus}
                  <span>从资产库挑选成片并排期</span>
                </button>
              </div>
            </div>

            {assetInventory.length === 0 ? (
              <div className="omx-empty-box">
                <h3 className="omx-empty-title">暂无就绪发布素材</h3>
                <p className="omx-empty-desc">在此集中管理发布所需的短视频与封面素材。当排期任务到达触发点时，系统仅在需要时才会按需下载并注入至对应真机。</p>
                <button type="button" className="omx-btn-ink" onClick={() => setActiveTab('schedules')} /* exempt-ui01 前往排期 */>前往排期管理</button>
              </div>
            ) : (
              <div className="omx-asset-shelf-grid">
                {assetInventory.map(ast => (
                  <div key={ast.id} className="omx-asset-shelf-card">
                    <div className="omx-asset-shelf-thumb">
                      <span className={`omx-asset-status-pill ${ast.state === 'fulfilled' ? 'omx-pill-fulfilled' : ast.state === 'locked' ? 'omx-pill-locked' : 'omx-pill-ready'}`}>
                        {ast.stateLabel}
                      </span>
                    </div>
                    <div className="omx-asset-shelf-body">
                      <div className="omx-asset-shelf-title">{ast.title}</div>
                      <div className="omx-asset-shelf-meta">{ast.meta}</div>
                      <div className="omx-asset-shelf-foot">
                        {ast.state === 'fulfilled' && (
                          <span className="omx-pill-success-text">防重发锁已激活</span>
                        )}
                        {ast.state === 'locked' && (
                          <span className="omx-pill-brand-text">{ast.targetAccount} {ast.scheduleTime}</span>
                        )}
                        {ast.state === 'ready' && (
                          <button type="button" className="omx-btn-ink omx-btn-sm-ink" onClick={() => { setActiveTab('schedules'); setScheduleFormOpen(true); showToast(`已将《${ast.title}》载入排期规划表单`) }} /* exempt-ui01 一键排期 */>
                            一键排期
                          </button>
                        )}
                        {ast.receiptUrl && (
                          <button type="button" className="omx-btn-receipt" onClick={() => { setCurrentReceipt({ url: ast.receiptUrl, title: ast.title, account: ast.targetAccount, metrics: '14.8k 播放 · 2.1k 赞' }); setReceiptModalOpen(true) }} /* exempt-ui01 资产查看线上帖 */>
                            <span>查看线上帖</span>
                            {ICONS.externalLink}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. 账号视图 (Accounts)：矩阵账号拓扑与安全发帖配额 */}
        {activeTab === 'accounts' && (
          <div>
            <div className="omx-section-card">
              <div className="omx-schedule-toolbar">
                <div className="omx-banner-left">
                  <h3 className="omx-section-title">矩阵账号拓扑与安全配额</h3>
                  <span className="omx-section-desc">账号与物理真机已彻底解耦。系统动态监控各账号今日发帖额度与健康权重指数。</span>
                </div>
                <button className="omx-btn-ink" onClick={() => showToast('请在手机上打开社交 App 并扫描完成托管授权')} /* exempt-ui01 绑定账号 */>
                  {ICONS.plus}
                  <span>绑定新社交账号</span>
                </button>
              </div>

              {matrixAccounts.length === 0 ? (
                <div className="omx-empty-box">
                  <h3 className="omx-empty-title">尚未配置绑定社交账号</h3>
                  <p className="omx-empty-desc">单台真机严格对应单个账号与专用网络隔离环境。请先通过「接入设备」向导纳管手机，再绑定登录账号。</p>
                  <button type="button" className="omx-btn-ink" onClick={() => setWizardOpen(true)} /* exempt-ui01 触发向导 */>打开接入向导</button>
                </div>
              ) : (
                <div className="omx-acc-grid">
                  {matrixAccounts.map(acc => (
                    <div key={acc.id} className="omx-acc-card">
                      <div className="omx-acc-head">
                        <div className="omx-acc-info">
                          <div className="omx-acc-avatar">
                            {acc.platform.includes('TikTok') ? ICONS.tiktok : acc.platform.slice(0, 2)}
                          </div>
                          <div className="omx-acc-meta">
                            <div className="omx-acc-handle">
                              <span>{acc.handle}</span>
                              <span className="omx-acc-platform-tag">{acc.platform}</span>
                            </div>
                            <div className="omx-acc-tz">{acc.tzDesc}</div>
                          </div>
                        </div>
                        <div className="omx-acc-health">
                          <span className="omx-acc-health-score">{acc.healthScore}</span>
                          <span className="omx-acc-health-label">{acc.healthLabel}</span>
                        </div>
                      </div>

                      <div className="omx-quota-box">
                        <div className="omx-quota-header">
                          <span className="omx-form-label">安全发布配额感知</span>
                          <span className={acc.isWarning ? 'omx-badge-orange' : 'omx-badge-green'}>{acc.quotaText}</span>
                        </div>
                        <div className="omx-quota-track">
                          <div className={`${acc.isWarning ? 'omx-quota-fill-warn' : 'omx-quota-fill-safe'} ${acc.quotaPercent === 100 ? 'omx-w-100' : acc.quotaPercent === 33 ? 'omx-w-33' : 'omx-w-0'}`} />
                        </div>
                      </div>

                      <div className="omx-acc-foot">
                        <span>承载宿主：{acc.hardware}</span>
                        <button type="button" className="omx-btn-subtle omx-btn-sm" onClick={() => showToast(`已启动无感设备漂移：${acc.handle} 任务将静默迁移至空闲机位`)} /* exempt-ui01 无感漂移 */>
                          无感漂移
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. 审计视图 (Activity)：每次自动化会话与执行记录归档 */}
        {activeTab === 'activity' && (
          <div>
            <div className="omx-section-card">
              <h3 className="omx-section-title">执行会话全量审计</h3>
              <p className="omx-section-desc">复盘每一次端到端自动化发片与养号会话，记录各设备的决策耗时、阻断拦截与回执。</p>
            </div>

            <div className="omx-empty-box">
              <h3 className="omx-empty-title">暂无已完成的执行会话</h3>
              <p className="omx-empty-desc">任务启动后会话将实时上报，并在完成后归档在此处。当物理设备保持唤醒且在线时，数据将以秒级同步更新。</p>
              <button className="omx-btn-subtle" onClick={() => setActiveTab('fleet')} /* exempt-ui01 查看集群 */>查看设备集群</button>
            </div>
          </div>
        )}

        {/* 6. 养号视图 (Warmup)：拟人化活跃策略 */}
        {activeTab === 'warmup' && (
          <div>
            <div className="omx-section-card">
              <h3 className="omx-section-title">自主养号策略与周期</h3>
              <p className="omx-section-desc">为指定真机编排长时间、拟人化的人工滑动与互动频次。账号绑定在账号页统一管理。</p>

              <div className="omx-warmup-grid">
                <div className="omx-warmup-card">
                  <div className="omx-warmup-label">单日互动频次</div>
                  <div className="omx-warmup-value">6 ~ 10 次</div>
                </div>
                <div className="omx-warmup-card">
                  <div className="omx-warmup-label">拟人爬坡周期</div>
                  <div className="omx-warmup-value">21 天梯度</div>
                </div>
                <div className="omx-warmup-card">
                  <div className="omx-warmup-label">每日活跃时间带</div>
                  <div className="omx-warmup-value">14 ~ 18 小时</div>
                </div>
              </div>
            </div>

            <div className="omx-empty-box">
              <h3 className="omx-empty-title">当前无执行中的养号流水线</h3>
              <p className="omx-empty-desc">设备接入并分配账号后即可开启拟人化自动点赞、评论与浏览，有效提升账号健康权重。</p>
              <button className="omx-btn-subtle" onClick={() => setActiveTab('accounts')} /* exempt-ui01 账号分配 */>前往账号分配</button>
            </div>
          </div>
        )}
      </div>

      {/* 侧边体检与单机详情抽屉 */}
      <div className={`omx-drawer-mask ${activeDrawer ? 'active' : ''}`} onClick={() => setActiveDrawer(null)}>
        {activeDrawer && (
          <div className="omx-drawer-panel" onClick={e => e.stopPropagation()}>
            <div className="omx-drawer-header">
              <div>
                <strong className="omx-drawer-title">{activeDrawer.name} ({activeDrawer.model})</strong>
                <div className="omx-drawer-meta">{activeDrawer.proxy}</div>
              </div>
              <button className="omx-btn-subtle omx-btn-sm" onClick={() => setActiveDrawer(null)} /* exempt-ui01 关闭抽屉 */>关闭</button>
            </div>

            <div className="omx-drawer-card">
              <div className="omx-drawer-success-line">{ICONS.check} USB 物理数据通道已建立</div>
              <div className="omx-drawer-success-line">{ICONS.check} 账号矩阵绑定: {activeDrawer.account}</div>
              <div className="omx-drawer-success-line">{ICONS.check} 开发者签名与守护进程正常</div>
            </div>

            <div>
              <div className="omx-drawer-section-title">11 项指标健康体检状态</div>
              {['开发者模式: 开启', '自动化权限: 就绪', '外观模式: 浅色', '自动锁定: 永不', '锁屏密码: 已配置', '减少动态效果: 开启', '待机模式: 关闭', '自动亮度: 关闭', '云端照片: 关闭', '住宅代理: 连通', '电池健康: 正常'].map(item => (
                <div key={item} className="omx-drawer-row">
                  <span>{item.split(':')[0]}</span>
                  <span className="omx-drawer-success-line">{ICONS.check} {item.split(':')[1]}</span>
                </div>
              ))}
            </div>

            <div className="omx-drawer-actions">
              <button className="omx-btn-subtle" onClick={() => showToast('体检复核完成')} /* exempt-ui01 重新体检 */>重新体检</button>
              <button className="omx-btn-ink" onClick={() => showToast('已模拟点按加号')} /* exempt-ui01 模拟微操 */>模拟微操</button>
            </div>
          </div>
        )}
      </div>

      {/* 居中大弹层：接入新设备向导 (Onboarding Wizard，对标 tame.so Fleet 向导并折叠证书) */}
      <div className={`omx-modal-mask ${wizardOpen ? 'active' : ''}`} onClick={() => setWizardOpen(false)}>
        {wizardOpen && (
          <div className="omx-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="omx-modal-header">
              <div>
                <h3 className="omx-modal-title">接入新设备向导</h3>
                <span className="omx-section-desc">四步完成 iPhone 真机池化纳管与自动化守护进程部署</span>
              </div>
              <button className="omx-btn-subtle omx-btn-sm" onClick={() => setWizardOpen(false)} /* exempt-ui01 关闭向导 */>
                {ICONS.close}
              </button>
            </div>

            <div className="omx-modal-body">
              {/* 四步向导步进条 */}
              <div className="omx-steps-row">
                <div className={`omx-step-card ${wizardStep === 1 ? 'active' : ''}`} onClick={() => setWizardStep(1)}>
                  <span className="omx-step-num">第 1 步</span>
                  <span className="omx-step-title">连接与信任</span>
                </div>
                <div className={`omx-step-card ${wizardStep === 2 ? 'active' : ''}`} onClick={() => setWizardStep(2)}>
                  <span className="omx-step-num">第 2 步</span>
                  <span className="omx-step-title">签名方案</span>
                </div>
                <div className={`omx-step-card ${wizardStep === 3 ? 'active' : ''}`} onClick={() => setWizardStep(3)}>
                  <span className="omx-step-num">第 3 步</span>
                  <span className="omx-step-title">自动部署</span>
                </div>
                <div className={`omx-step-card ${wizardStep === 4 ? 'active' : ''}`} onClick={() => setWizardStep(4)}>
                  <span className="omx-step-num">第 4 步</span>
                  <span className="omx-step-title">真机就绪</span>
                </div>
              </div>

              {/* 步骤 1: 准备清单与物理连接 */}
              {wizardStep === 1 && (
                <div>
                  <h4 className="omx-section-title">1. 接入前准备清单</h4>
                  <div className="omx-checklist">
                    <div className="omx-checklist-item">{ICONS.check} <span>Apple Silicon 芯片的 Mac (支持 M1/M2/M3/M4 系列，macOS 14+)</span></div>
                    <div className="omx-checklist-item">{ICONS.check} <span>安装完整版 Xcode (仅在后台静默调用签名工具，无需手动建工程)</span></div>
                    <div className="omx-checklist-item">{ICONS.check} <span>专用测试机，关闭锁屏密码或已知密码，开启「开发者模式」</span></div>
                    <div className="omx-checklist-item">{ICONS.check} <span>使用经过认证的高速数据线连接 iPhone，在手机上点击「信任此电脑」</span></div>
                  </div>
                </div>
              )}

              {/* 步骤 2: 签名方案 (折叠原证书页) */}
              {wizardStep === 2 && (
                <div>
                  <h4 className="omx-section-title">2. 选择自动化守护签名方案</h4>
                  <div className="omx-options-grid">
                    <div
                      className={`omx-option-card ${signOption === 'team' ? 'active' : ''}`}
                      onClick={() => setSignOption('team')}
                    >
                      <span className="omx-option-badge">推荐 · 支持机房集群</span>
                      <strong className="omx-option-title">Apple 开发者计划 API 密钥</strong>
                      <span className="omx-option-desc">接入 Team API 密钥 (.p8) 后自动注册并纳管设备。每个苹果账号每年支持自动签名高达 100 台真机。</span>
                    </div>
                    <div
                      className={`omx-option-card ${signOption === 'free' ? 'active' : ''}`}
                      onClick={() => setSignOption('free')}
                    >
                      <strong className="omx-option-title">免费 Apple ID 个人证书</strong>
                      <span className="omx-option-desc">在 Xcode 中直接登录个人免费账号，适合用于 1 ~ 3 台设备的小规模轻度体验与研发测试。</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 步骤 3 & 4 */}
              {wizardStep >= 3 && (
                <div className="omx-section-card">
                  <h4 className="omx-section-title">{wizardStep === 3 ? '3. 自动构建与部署中' : '4. 设备已就绪上线'}</h4>
                  <p className="omx-section-desc">
                    {wizardStep === 3
                      ? '系统已在后台自动识别接入的 iPhone，并正在完成签名注入与无障碍通信通道握手...'
                      : '物理设备屏幕已成功唤醒！设备已加入可用集群池，现在可通过对话指令驱动发布任务。'}
                  </p>
                </div>
              )}
            </div>

            <div className="omx-modal-footer">
              {wizardStep > 1 && (
                <button className="omx-btn-subtle" onClick={() => setWizardStep(s => s - 1)} /* exempt-ui01 上一步 */>上一步</button>
              )}
              {wizardStep < 4 ? (
                <button className="omx-btn-ink" onClick={() => setWizardStep(s => s + 1)} /* exempt-ui01 下一步 */>下一步</button>
              ) : (
                <button className="omx-btn-ink" onClick={() => { setWizardOpen(false); setWizardStep(1); showToast('新设备已成功纳管！'); }} /* exempt-ui01 完成接入 */>完成接入</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 居中大弹层：AI 权限白名单说明 (Connect AI 护栏) */}
      <div className={`omx-modal-mask ${whitelistOpen ? 'active' : ''}`} onClick={() => setWhitelistOpen(false)}>
        {whitelistOpen && (
          <div className="omx-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="omx-modal-header">
              <div>
                <h3 className="omx-modal-title">OmniMux AI 移动智能体权限与安全护栏</h3>
                <span className="omx-section-desc">明确划分 AI 自主操作边界，所有不可逆动作严格受物理门禁保护</span>
              </div>
              <button className="omx-btn-subtle omx-btn-sm" onClick={() => setWhitelistOpen(false)} /* exempt-ui01 关闭弹层 */>
                {ICONS.close}
              </button>
            </div>

            <div className="omx-modal-body">
              <div className="omx-whitelist-grid">
                <div className="omx-whitelist-col allowed">
                  <div className="omx-whitelist-head">{ICONS.check} 允许 AI 自主执行</div>
                  <div className="omx-whitelist-item"><span>•</span><span>毫秒级感知屏幕无障碍树控件与 OCR 文字找点</span></div>
                  <div className="omx-whitelist-item"><span>•</span><span>点击加号、选择视频素材并自动粘贴核准的文案</span></div>
                  <div className="omx-whitelist-item"><span>•</span><span>自动识别并优雅关闭评分、系统升级等偶发干扰弹窗</span></div>
                  <div className="omx-whitelist-item"><span>•</span><span>按照预定排期时间自动唤醒屏幕并执行发布流水线</span></div>
                  <div className="omx-whitelist-item"><span>•</span><span>实时检测并上报设备在线状态、电量与发布回执</span></div>
                </div>

                <div className="omx-whitelist-col forbidden">
                  <div className="omx-whitelist-head">{ICONS.forbid} 严禁擅自执行 (必须人工确认)</div>
                  <div className="omx-whitelist-item"><span>•</span><span>严禁擅自删除相册中未经授权的照片、视频或文件</span></div>
                  <div className="omx-whitelist-item"><span>•</span><span>严禁擅自修改设备的 Wi-Fi、代理网络或 iCloud 账号</span></div>
                  <div className="omx-whitelist-item"><span>•</span><span>严禁执行涉及真实资金消费、订阅支付或充值操作</span></div>
                  <div className="omx-whitelist-item"><span>•</span><span>严禁私自修改社交平台账号密码、解绑手机号或注销</span></div>
                  <div className="omx-whitelist-item"><span>•</span><span>未达到 0.95 置信度时拒绝盲点并自动挂起报警</span></div>
                </div>
              </div>
            </div>

            <div className="omx-modal-footer">
              <button className="omx-btn-ink" onClick={() => setWhitelistOpen(false)} /* exempt-ui01 安全确认 */>我已知晓安全护栏</button>
            </div>
          </div>
        )}
      </div>

      {/* 履约回执凭证模态弹窗 (SaaS 科技回执) */}
      <div className={`omx-modal-mask ${receiptModalOpen ? 'active' : ''}`} onClick={() => setReceiptModalOpen(false)}>
        {receiptModalOpen && currentReceipt && (
          <div className="omx-receipt-dialog-box" onClick={e => e.stopPropagation()}>
            <div className="omx-modal-header">
              <div className="omx-modal-title">
                {ICONS.check}
                <span>发帖履约凭证与线上回执</span>
              </div>
              <button className="omx-btn-subtle omx-btn-sm" onClick={() => setReceiptModalOpen(false)} /* exempt-ui01 关闭回执 */>
                {ICONS.close}
              </button>
            </div>
            <div className="omx-receipt-grid">
              <div className="omx-receipt-grid-item">
                <span className="omx-form-label">成片标题</span>
                <strong>{currentReceipt.title}</strong>
              </div>
              <div className="omx-receipt-grid-item">
                <span className="omx-form-label">目标账号</span>
                <strong>{currentReceipt.account}</strong>
              </div>
              <div className="omx-receipt-grid-item">
                <span className="omx-form-label">时区排期与履约</span>
                <span>{currentReceipt.time || '美西 19:30 · 黄金档 (已履约)'}</span>
              </div>
              <div className="omx-receipt-grid-item">
                <span className="omx-form-label">实时线上表现</span>
                <span className="omx-pill-success-text">{currentReceipt.metrics || '线上数据抓取中'}</span>
              </div>
            </div>
            <div className="omx-receipt-link-card">
              <span>{currentReceipt.url}</span>
              <button type="button" className="omx-btn-ink omx-btn-sm-ink" onClick={() => { navigator.clipboard?.writeText(currentReceipt.url); showToast('已复制海外社媒线上直链') }} /* exempt-ui01 复制链接 */>
                复制直链
              </button>
            </div>
            <div className="omx-drawer-actions">
              <button type="button" className="omx-btn-subtle" onClick={() => setReceiptModalOpen(false)} /* exempt-ui01 关闭弹层 */>
                关闭
              </button>
              <button type="button" className="omx-btn-ink" onClick={() => { showToast('已请求在系统默认浏览器中打开该社媒链接'); setReceiptModalOpen(false) }} /* exempt-ui01 浏览器打开视频 */>
                在浏览器打开线上视频
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 浮动轻提示 (Toast) */}
      {toastMsg && (
        <div className="omx-toast-float">
          {toastMsg}
        </div>
      )}
    </div>
  )
}
