export const locales = {
  'zh-CN': {
    nav: '手机管理',
    title: '手机管理',
    subtitle: '本地物理真机阵列纳管，11项底层健康自检与双脑决策控制回路',
    refresh: '全量体检',
    addDevice: '接入新手机',
    tabFleet: '真机大屏',
    tabSchedules: '周历排期',
    tabInspector: '断点对比器',
    tabSigning: '开发者证书',
    tabWarmup: '自动养号',
  },
  'en-US': {
    nav: 'Devices',
    title: 'Device Management',
    subtitle: 'Local iPhone fleet management with 11 health checks & dual-brain decision loop',
    refresh: 'Recheck All',
    addDevice: 'Add iPhone',
    tabFleet: 'Fleet',
    tabSchedules: 'Schedules',
    tabInspector: 'Inspector',
    tabSigning: 'Apple Signing',
    tabWarmup: 'Warmup',
  },
}

export function createTranslate(locale = 'zh-CN') {
  const dict = locales[locale] || locales['zh-CN']
  return (key) => dict[key] || key
}
