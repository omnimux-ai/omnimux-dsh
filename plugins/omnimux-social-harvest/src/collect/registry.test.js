/**
 * @file 平台注册表完整性单测。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { SITES, getCommand, registryView } from './registry.js'

// 写操作命令 id 精确集合（前缀匹配会误伤 youtube.comments 这类读命令）
const WRITE_IDS = new Set([
  'like', 'unlike', 'follow', 'unfollow', 'comment', 'post', 'publish', 'save', 'unsave',
  'subscribe', 'unsubscribe', 'delete', 'update', 'join-group', 'add-friend', 'draft',
  'pin-create', 'pin-delete', 'pin-update', 'board-create', 'board-delete', 'delete-note',
])

describe('registry', () => {
  it('10 个平台齐备', () => {
    assert.deepEqual(
      SITES.map((s) => s.id),
      ['tiktok', 'instagram', 'pinterest', 'youtube', 'twitter', 'facebook', 'xiaohongshu', 'douyin', 'linkedin', 'flow'],
    )
  })

  it('写操作命令零登记（只读契约）', () => {
    for (const site of SITES) {
      for (const cmd of site.commands) {
        assert.ok(!WRITE_IDS.has(cmd.id), `${site.id}.${cmd.id} 疑似写操作`)
        assert.ok(!cmd.tags.includes('write'), `${site.id}.${cmd.id} 带 write 标签`)
      }
    }
  })

  it('除 pinterest 外各站都有 login + whoami', () => {
    for (const site of SITES) {
      if (site.id === 'pinterest') {
        assert.equal(site.free, true)
        assert.equal(site.login, false)
        assert.ok(!site.commands.some((c) => c.id === 'login'))
        continue
      }
      assert.ok(site.commands.some((c) => c.id === 'login' && c.loginCmd), `${site.id} 缺 login`)
      assert.ok(site.commands.some((c) => c.id === 'whoami'), `${site.id} 缺 whoami`)
    }
  })

  it('表单字段类型合法且 key 唯一', () => {
    const VALID = new Set(['text', 'url', 'number', 'select'])
    for (const site of SITES) {
      for (const cmd of site.commands) {
        const keys = new Set()
        for (const f of cmd.form) {
          assert.ok(VALID.has(f.type), `${site.id}.${cmd.id}.${f.key} 类型非法: ${f.type}`)
          assert.ok(!keys.has(f.key), `${site.id}.${cmd.id} 字段重复: ${f.key}`)
          keys.add(f.key)
          if (f.type === 'select') assert.ok(Array.isArray(f.choices) && f.choices.length > 0)
          if (f.type === 'number') assert.ok(f.min < f.max)
        }
      }
    }
  })

  it('argv 构造器全部为纯函数且首元素为站点 id', () => {
    for (const site of SITES) {
      for (const cmd of site.commands) {
        const args = {}
        for (const f of cmd.form) {
          if (f.type === 'number') args[f.key] = f.value
          else if (f.type === 'select') args[f.key] = f.value
          else args[f.key] = 'x'
        }
        const argv = cmd.argv(args)
        assert.equal(argv[0], site.id, `${site.id}.${cmd.id}`)
        assert.equal(argv[1], cmd.loginCmd ? 'login' : argv[1])
      }
    }
  })

  it('registryView 可 JSON 序列化（剥离函数）', () => {
    const view = registryView()
    const round = JSON.parse(JSON.stringify(view))
    assert.equal(round.length, SITES.length)
    assert.ok(round.every((s) => typeof s.name === 'string' && Array.isArray(s.commands)))
    assert.ok(round.every((s) => s.commands.every((c) => typeof c.argv === 'undefined')))
  })

  it('getCommand 未登记返回 undefined', () => {
    assert.equal(getCommand('tiktok', 'post'), undefined)
    assert.equal(getCommand('threads', 'search'), undefined)
  })
})
