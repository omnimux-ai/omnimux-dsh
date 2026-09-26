import { test } from 'node:test'
import { equal, ok } from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { checkPresetsHealth } from './verify-agent-presets.mjs'

test('GATE-02: 出厂预设白名单与正交性校验', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'test-agent-presets-'))
  try {
    // 1. 创建合法的 cordis 和社媒角色预设
    mkdirSync(join(tmp, 'cordis'))
    mkdirSync(join(tmp, 'tiktok-agent'))
    mkdirSync(join(tmp, 'instagram-agent'))

    writeFileSync(
      join(tmp, 'tiktok-agent', 'skills.json'),
      JSON.stringify({
        presetId: 'tiktok-agent',
        skills: [{ id: 'tk-1', slug: 'tiktok-blue-ocean' }, { id: 'tk-2', slug: 'download-tk-video' }],
      })
    )

    writeFileSync(
      join(tmp, 'instagram-agent', 'skills.json'),
      JSON.stringify({
        presetId: 'instagram-agent',
        skills: [{ id: 'ig-1', slug: 'carousel-maker' }, { id: 'ig-2', slug: 'ig-visual-aesthetic' }],
      })
    )

    const resPass = checkPresetsHealth(tmp)
    equal(resPass.valid, true)
    equal(resPass.errors.length, 0)

    // 2. 混入非法非社媒预设（如 standard 代码开发）
    mkdirSync(join(tmp, 'standard'))
    const resFailStandard = checkPresetsHealth(tmp)
    equal(resFailStandard.valid, false)
    ok(resFailStandard.errors.some((e) => e.includes('非法预设角色 [standard]')))
    rmSync(join(tmp, 'standard'), { recursive: true })

    // 3. 技能复制粘贴（重合度超过 30%）
    writeFileSync(
      join(tmp, 'instagram-agent', 'skills.json'),
      JSON.stringify({
        presetId: 'instagram-agent',
        skills: [{ id: 'tk-1', slug: 'tiktok-blue-ocean' }, { id: 'tk-2', slug: 'download-tk-video' }],
      })
    )
    const resFailOverlap = checkPresetsHealth(tmp)
    equal(resFailOverlap.valid, false)
    ok(resFailOverlap.errors.some((e) => e.includes('重合度过高')))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
