/**
 * @file 平台注册表 —— 9 个社媒平台的命令清单、表单规格与 argv 构造。
 *
 * 设计契约（演示页 v3 已确认）：点击工具行 → 弹窗按 form 规格渲染表单 → 执行。
 * 一条命令 = { id, summary, tags, form, argv }。argv 为纯函数，逐位被单测断言。
 *
 * 边界：只登记 read 采集命令 + login/whoami 自检；write 类命令（点赞/发帖/评论）永不登记。
 * 本文件属纯数据与纯函数：不 import node:*，不触达外部世界。
 */

/** 表单字段构造器（规格即数据，客户端照此渲染）。 */
export const F = {
  keyword: (label = '关键词') => ({
    key: 'query', label, type: 'text', required: true,
    placeholder: '例如：portable blender 便携榨汁杯',
  }),
  handle: (label = '用户名') => ({
    key: 'target', label, type: 'text', required: true,
    placeholder: '例如 @creator 或主页链接',
  }),
  link: (label = '链接') => ({
    key: 'url', label, type: 'url', required: true,
    placeholder: '粘贴链接', hint: '支持粘贴，自动识别平台',
  }),
  limit: () => ({ key: 'limit', label: '数量上限', type: 'number', min: 5, max: 50, value: 15 }),
  prompt: (label = '提示词') => ({
    key: 'prompt', label, type: 'text', required: true,
    placeholder: '例如：a cinematic slow pan over a futuristic city at sunset',
  }),
  ratio: (label = '画面比例', choices = [['16:9', '16:9'], ['4:3', '4:3'], ['1:1', '1:1'], ['3:4', '3:4'], ['9:16', '9:16']], defaultValue = '16:9') => ({
    key: 'ratio', label, type: 'select', choices, value: defaultValue,
  }),
  count: (label = '生成张数', min = 1, max = 4, defaultValue = 1) => ({
    key: 'count', label, type: 'number', min, max, value: defaultValue,
  }),
  output: (label = '保存路径 (选填)') => ({
    key: 'output', label, type: 'text', required: false,
    placeholder: '选填，如 ./output.png（留空自动保存）',
  }),
}

/** @typedef {{ id: string, summary: string, tags: string[], form: object[], argv: (args: any) => string[], needsAuth?: boolean, loginCmd?: boolean }} CommandSpec */
/** @typedef {{ id: string, name: string, glyph: string, free?: boolean, login: boolean, commands: CommandSpec[] }} SiteSpec */

/** @type {SiteSpec[]} */
export const SITES = [
  {
    id: 'tiktok', name: 'TikTok', glyph: 'T', login: true,
    commands: [
      { id: 'search', summary: '按关键词搜索视频', tags: ['read'], form: [F.keyword(), F.limit()],
        argv: (a) => ['tiktok', 'search', a.query, '-f', 'json', '--limit', String(a.limit)] },
      { id: 'user', summary: '创作者近期视频列表', tags: ['read'], form: [F.handle('创作者主页'), F.limit()],
        argv: (a) => ['tiktok', 'user', a.target, '-f', 'json', '--limit', String(a.limit)] },
      { id: 'explore', summary: '推荐流热门视频', tags: ['read'], form: [F.limit()],
        argv: (a) => ['tiktok', 'explore', '-f', 'json', '--limit', String(a.limit)] },
      { id: 'creator-videos', summary: '创作者中心内容数据（播放/点赞/评论/收藏）', tags: ['read', 'auth'], needsAuth: true, form: [F.limit()],
        argv: (a) => ['tiktok', 'creator-videos', '-f', 'json', '--limit', String(a.limit)] },
      { id: 'login', summary: '打开登录页并等待人工完成登录', tags: ['auth'], loginCmd: true, form: [],
        argv: () => ['tiktok', 'login'] },
      { id: 'whoami', summary: '查看当前登录账号', tags: ['auth'], form: [],
        argv: () => ['tiktok', 'whoami', '-f', 'json'] },
    ],
  },
  {
    id: 'instagram', name: 'Instagram', glyph: 'I', login: true,
    commands: [
      { id: 'user', summary: '用户近期帖子与 Reels', tags: ['read'], form: [F.handle(), F.limit()],
        argv: (a) => ['instagram', 'user', a.target, '-f', 'json', '--limit', String(a.limit)] },
      { id: 'search', summary: '搜索用户', tags: ['read'], form: [F.keyword(), F.limit()],
        argv: (a) => ['instagram', 'search', a.query, '-f', 'json', '--limit', String(a.limit)] },
      { id: 'explore', summary: '探索页 trending 帖子', tags: ['read'], form: [F.limit()],
        argv: (a) => ['instagram', 'explore', '-f', 'json', '--limit', String(a.limit)] },
      { id: 'download', summary: '下载帖子图片与视频到本地', tags: ['read', 'auth'], needsAuth: true, form: [F.link('帖子 / Reel 链接')],
        argv: (a) => ['instagram', 'download', a.url, '-f', 'json'] },
      { id: 'login', summary: '打开登录页并等待人工完成登录', tags: ['auth'], loginCmd: true, form: [],
        argv: () => ['instagram', 'login'] },
      { id: 'whoami', summary: '查看当前登录账号', tags: ['auth'], form: [],
        argv: () => ['instagram', 'whoami', '-f', 'json'] },
    ],
  },
  {
    id: 'pinterest', name: 'Pinterest', glyph: 'P', free: true, login: false,
    commands: [
      { id: 'search-pins', summary: '搜索图钉（免登录可用）', tags: ['read'], form: [F.keyword(), F.limit()],
        argv: (a) => ['pinterest', 'search-pins', a.query, '-f', 'json', '--limit', String(a.limit)] },
      { id: 'user-pins', summary: '用户创建的图钉列表', tags: ['read'], form: [F.handle(), F.limit()],
        argv: (a) => ['pinterest', 'user-pins', a.target, '-f', 'json', '--limit', String(a.limit)] },
      { id: 'pin', summary: '单个图钉详情', tags: ['read'], form: [F.link('图钉链接')],
        argv: (a) => ['pinterest', 'pin', a.url, '-f', 'json'] },
      { id: 'download', summary: '下载图钉原图到本地', tags: ['read'], form: [F.link('图钉链接')],
        argv: (a) => ['pinterest', 'download', a.url, '-f', 'json'] },
    ],
  },
  {
    id: 'youtube', name: 'YouTube', glyph: 'Y', login: true,
    commands: [
      { id: 'search', summary: '搜索视频 / Shorts / 频道', tags: ['read'], form: [F.keyword(), F.limit()],
        argv: (a) => ['youtube', 'search', a.query, '-f', 'json', '--limit', String(a.limit)] },
      { id: 'video', summary: '视频元数据（标题/播放/描述）', tags: ['read'], form: [F.link('视频链接')],
        argv: (a) => ['youtube', 'video', a.url, '-f', 'json'] },
      { id: 'transcript', summary: '视频字幕全文（解构文案用）', tags: ['read'], form: [F.link('视频链接')],
        argv: (a) => ['youtube', 'transcript', a.url, '-f', 'json'] },
      { id: 'comments', summary: '视频评论列表', tags: ['read'], form: [F.link('视频链接'), F.limit()],
        argv: (a) => ['youtube', 'comments', a.url, '-f', 'json', '--limit', String(a.limit)] },
      { id: 'login', summary: '打开登录页并等待人工完成登录', tags: ['auth'], loginCmd: true, form: [],
        argv: () => ['youtube', 'login'] },
      { id: 'whoami', summary: '查看当前登录账号', tags: ['auth'], form: [],
        argv: () => ['youtube', 'whoami', '-f', 'json'] },
    ],
  },
  {
    id: 'twitter', name: 'X (Twitter)', glyph: 'X', login: true,
    commands: [
      { id: 'search', summary: '话题搜索（支持结果类型筛选）', tags: ['read'],
        form: [F.keyword(), { key: 'product', label: '结果类型', type: 'select', choices: [['top', '热门'], ['live', '最新'], ['photos', '图片'], ['videos', '视频']], value: 'top' }, F.limit()],
        argv: (a) => ['twitter', 'search', a.query, '--product', a.product ?? 'top', '-f', 'json', '--limit', String(a.limit)] },
      { id: 'timeline', summary: '首页时间线', tags: ['read', 'auth'], needsAuth: true,
        form: [{ key: 'type', label: '信息流', type: 'select', choices: [['for-you', '为你推荐'], ['following', '正在关注']], value: 'for-you' }, F.limit()],
        argv: (a) => ['twitter', 'timeline', '-f', 'json', '--limit', String(a.limit), ...(a.type === 'following' ? ['--type', 'following'] : [])] },
      { id: 'login', summary: '打开登录页并等待人工完成登录', tags: ['auth'], loginCmd: true, form: [],
        argv: () => ['twitter', 'login'] },
      { id: 'whoami', summary: '查看当前登录账号', tags: ['auth'], form: [],
        argv: () => ['twitter', 'whoami', '-f', 'json'] },
    ],
  },
  {
    id: 'facebook', name: 'Facebook', glyph: 'f', login: true,
    commands: [
      { id: 'search', summary: '搜索用户、主页或帖子', tags: ['read'], form: [F.keyword(), F.limit()],
        argv: (a) => ['facebook', 'search', a.query, '-f', 'json', '--limit', String(a.limit)] },
      { id: 'groups', summary: '我的小组列表', tags: ['read', 'auth'], needsAuth: true, form: [],
        argv: () => ['facebook', 'groups', '-f', 'json'] },
      { id: 'marketplace-listings', summary: 'Marketplace 在售商品', tags: ['read', 'auth'], needsAuth: true, form: [F.limit()],
        argv: (a) => ['facebook', 'marketplace-listings', '-f', 'json', '--limit', String(a.limit)] },
      { id: 'login', summary: '打开登录页并等待人工完成登录', tags: ['auth'], loginCmd: true, form: [],
        argv: () => ['facebook', 'login'] },
      { id: 'whoami', summary: '查看当前登录账号', tags: ['auth'], form: [],
        argv: () => ['facebook', 'whoami', '-f', 'json'] },
    ],
  },
  {
    id: 'xiaohongshu', name: '小红书', glyph: '红', login: true,
    commands: [
      { id: 'search', summary: '笔记搜索', tags: ['read', 'auth'], needsAuth: true, form: [F.keyword(), F.limit()],
        argv: (a) => ['xiaohongshu', 'search', a.query, '-f', 'json', '--limit', String(a.limit)] },
      { id: 'note', summary: '笔记正文与互动数据', tags: ['read', 'auth'], needsAuth: true, form: [F.link('笔记链接或 ID')],
        argv: (a) => ['xiaohongshu', 'note', a.url, '-f', 'json'] },
      { id: 'creator-stats', summary: '创作者数据总览', tags: ['read', 'auth'], needsAuth: true, form: [],
        argv: () => ['xiaohongshu', 'creator-stats', '-f', 'json'] },
      { id: 'download', summary: '下载笔记图片和视频', tags: ['read', 'auth'], needsAuth: true, form: [F.link('笔记链接')],
        argv: (a) => ['xiaohongshu', 'download', a.url, '-f', 'json'] },
      { id: 'login', summary: '打开登录页并等待人工完成登录', tags: ['auth'], loginCmd: true, form: [],
        argv: () => ['xiaohongshu', 'login'] },
      { id: 'whoami', summary: '查看当前登录账号', tags: ['auth'], form: [],
        argv: () => ['xiaohongshu', 'whoami', '-f', 'json'] },
    ],
  },
  {
    id: 'douyin', name: '抖音', glyph: '抖', login: true,
    commands: [
      { id: 'search', summary: '关键词搜索视频', tags: ['read', 'auth'], needsAuth: true, form: [F.keyword(), F.limit()],
        argv: (a) => ['douyin', 'search', a.query, '-f', 'json', '--limit', String(a.limit)] },
      { id: 'user-videos', summary: '用户视频列表（含下载地址与热门评论）', tags: ['read', 'auth'], needsAuth: true, form: [F.handle('用户 sec_uid')],
        argv: (a) => ['douyin', 'user-videos', a.target, '-f', 'json'] },
      { id: 'hashtag', summary: '话题搜索与热点词', tags: ['read'], form: [F.keyword('话题词')],
        argv: (a) => ['douyin', 'hashtag', 'search', a.query, '-f', 'json'] },
      { id: 'login', summary: '打开登录页并等待人工完成登录', tags: ['auth'], loginCmd: true, form: [],
        argv: () => ['douyin', 'login'] },
      { id: 'whoami', summary: '查看当前登录账号', tags: ['auth'], form: [],
        argv: () => ['douyin', 'whoami', '-f', 'json'] },
    ],
  },
  {
    id: 'linkedin', name: 'LinkedIn', glyph: 'in', login: true,
    commands: [
      { id: 'search', summary: '职场内容搜索', tags: ['read', 'auth'], needsAuth: true, form: [F.keyword(), F.limit()],
        argv: (a) => ['linkedin', 'search', a.query, '-f', 'json', '--limit', String(a.limit)] },
      { id: 'login', summary: '打开登录页并等待人工完成登录', tags: ['auth'], loginCmd: true, form: [],
        argv: () => ['linkedin', 'login'] },
      { id: 'whoami', summary: '查看当前登录账号', tags: ['auth'], form: [],
        argv: () => ['linkedin', 'whoami', '-f', 'json'] },
    ],
  },
  {
    id: 'flow', name: 'Google Flow', glyph: 'G', login: true,
    commands: [
      { id: 'image', summary: 'AI 生图：在 Flow 生成图片并支持本地下载', tags: ['create', 'auth'], needsAuth: true,
        form: [F.prompt('图片提示词'), F.ratio(), F.count('生成张数', 1, 4, 1), F.output('保存路径 (选填)')],
        argv: (a) => ['flow', 'image', a.prompt, '--ratio', a.ratio ?? '16:9', '--count', String(a.count ?? 1), ...(a.output ? ['--output', a.output] : []), '-f', 'json'] },
      { id: 'video', summary: 'AI 生视频：在 Flow 生成 Veo 视频并支持导出 720p', tags: ['create', 'auth'], needsAuth: true,
        form: [F.prompt('视频提示词'), F.ratio('视频比例', [['16:9', '16:9'], ['9:16', '9:16']], '16:9'), F.output('保存路径 (选填)')],
        argv: (a) => ['flow', 'video', a.prompt, '--ratio', a.ratio ?? '16:9', ...(a.output ? ['--output', a.output] : []), '-f', 'json'] },
      { id: 'login', summary: '打开 Flow 登录页并等待人工完成登录', tags: ['auth'], loginCmd: true, form: [],
        argv: () => ['flow', 'login'] },
      { id: 'whoami', summary: '查看当前登录账号', tags: ['auth'], form: [],
        argv: () => ['flow', 'whoami', '-f', 'json'] },
    ],
  },
]

/** @param {string} siteId @returns {SiteSpec | undefined} */
export function getSite(siteId) {
  return SITES.find((s) => s.id === siteId)
}

/**
 * 取命令规格。
 * @param {string} siteId @param {string} commandId
 * @returns {{ site: SiteSpec, command: CommandSpec } | undefined}
 */
export function getCommand(siteId, commandId) {
  const site = getSite(siteId)
  const command = site?.commands.find((c) => c.id === commandId)
  return site && command ? { site, command } : undefined
}

/**
 * 给客户端的纯数据视图（剥离函数，可 JSON 序列化）。
 * @returns {Array<{ id: string, name: string, glyph: string, free: boolean, login: boolean,
 *   commands: Array<{ id: string, summary: string, tags: string[], form: object[], needsAuth: boolean, loginCmd: boolean }> }>}
 */
export function registryView() {
  return SITES.map((s) => ({
    id: s.id,
    name: s.name,
    glyph: s.glyph,
    free: s.free === true,
    login: s.login,
    commands: s.commands.map((c) => ({
      id: c.id,
      summary: c.summary,
      tags: c.tags,
      form: c.form,
      needsAuth: c.needsAuth === true,
      loginCmd: c.loginCmd === true,
    })),
  }))
}
