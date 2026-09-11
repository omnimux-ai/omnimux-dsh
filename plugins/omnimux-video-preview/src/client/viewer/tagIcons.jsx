import React from 'react'
import {
  FramingIcon,
  CameraIcon,
  AngleIcon,
  MotionIcon,
} from '../icons.jsx'

const TAG_ICON_RULES = [
  { pattern: /特写|远景|全景|中景|近景|景别/i, Component: FramingIcon },
  { pattern: /手机|相机|机位|车载|设备|航拍|云台|固定/i, Component: CameraIcon },
  { pattern: /俯视|平视|仰视|顶视|角度|俯角|仰角|视点/i, Component: AngleIcon },
  { pattern: /微动|平移|移动|推拉|摇镜|运镜|跟随|旋转|环绕/i, Component: MotionIcon },
]

export function renderTagIcon(tagStr, size = 12) {
  const text = String(tagStr || '')
  for (const rule of TAG_ICON_RULES) {
    if (rule.pattern.test(text)) {
      const Comp = rule.Component
      return <Comp size={size} />
    }
  }
  return <FramingIcon size={size} />
}
