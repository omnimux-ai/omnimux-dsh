import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { libraryPreviewUrl } from './composer-attachments.js'

describe('e2e: 从资产库添加后卡槽显示缩略图', () => {
  it('预览地址必须带封面文件，否则加载失败只剩空白占位', () => {
    const broken = libraryPreviewUrl('ast_5d967d2c', '')
    const fixed = libraryPreviewUrl('ast_5d967d2c', 'fil_e23d9fe9')
    assert.equal(broken, '')
    assert.equal(fixed, '/omnimux/assets/library/preview?id=ast_5d967d2c&file=fil_e23d9fe9')
    assert.match(fixed, /[?&]file=fil_e23d9fe9/)
  })
})
