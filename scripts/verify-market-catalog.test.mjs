import { test } from 'node:test'
import { equal, ok } from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { checkMarketCatalog } from './verify-market-catalog.mjs'

test('GATE-03: 市场目录元数据完整性校验', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'test-market-catalog-'))
  const catPath = join(tmp, 'index.json')
  try {
    // 1. 合法目录
    writeFileSync(
      catPath,
      JSON.stringify({
        items: [
          { id: 'sk-1', title: '全网检索', kind: 'skill', installType: 'pre-installed' },
          { id: 'sk-2', title: '小众画风', kind: 'skill', installType: 'marketplace' },
        ],
      })
    )

    const resPass = checkMarketCatalog(catPath)
    equal(resPass.valid, true)
    equal(resPass.stats.total, 2)
    equal(resPass.stats.preinstalled, 1)
    equal(resPass.stats.marketplace, 1)

    // 2. 缺失 installType
    writeFileSync(
      catPath,
      JSON.stringify({
        items: [{ id: 'sk-1', title: '未标注状态' }],
      })
    )
    const resFailMissing = checkMarketCatalog(catPath)
    equal(resFailMissing.valid, false)
    ok(resFailMissing.errors[0].includes('缺失 installType'))

    // 3. 非法 installType
    writeFileSync(
      catPath,
      JSON.stringify({
        items: [{ id: 'sk-1', title: '非法状态', installType: 'unknown' }],
      })
    )
    const resFailInvalid = checkMarketCatalog(catPath)
    equal(resFailInvalid.valid, false)
    ok(resFailInvalid.errors[0].includes('installType 非法'))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
