export const locales = {
  'zh-CN': {
    nav: '手机管理',
    title: '手机管理',
    subtitle: '物理集群 · 15台就绪',
    refresh: '刷新体检',
    addDevice: '接入设备',
    tabFleet: '集群',
    tabSchedules: '排期',
    tabInspector: '诊断',
    tabSigning: '证书',
    tabWarmup: '养号',
  },
  'en-US': {
    nav: 'Devices',
    title: 'Devices',
    subtitle: 'Fleet · 15 Ready',
    refresh: 'Recheck',
    addDevice: 'Add Device',
    tabFleet: 'Fleet',
    tabSchedules: 'Schedules',
    tabInspector: 'Inspector',
    tabSigning: 'Signing',
    tabWarmup: 'Warmup',
  },
}

export function createTranslate(locale = 'zh-CN') {
  const dict = locales[locale] || locales['zh-CN']
  return (key) => dict[key] || key
}
