// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { snapshotFormFields, fillFormFields } from '../src/content/form-draft.ts'

describe('safe form draft snapshot and filling', () => {
  it('snapshots only safe visible editable fields without leaking values in labels', () => {
    document.body.innerHTML = `
      <form id="profile-form">
        <label for="username">用户名</label>
        <input id="username" type="text" value="existing_user" />

        <label for="bio">个人简介</label>
        <textarea id="bio">这是已有简介的内容，绝对不能作为标签泄露</textarea>

        <label for="pwd">密码</label>
        <input id="pwd" type="password" value="secret123" />

        <input type="hidden" name="csrf" value="token" />
        <input type="text" id="disabled-input" disabled value="disabled" />
      </form>
    `

    const snapshot = snapshotFormFields(document)
    expect(snapshot.fields.length).toBe(2)

    const usernameField = snapshot.fields.find((f) => f.id === 'username')
    expect(usernameField).toBeDefined()
    expect(usernameField?.label).toBe('用户名')
    expect(usernameField?.hasValue).toBe(true)

    const bioField = snapshot.fields.find((f) => f.id === 'bio')
    expect(bioField).toBeDefined()
    expect(bioField?.label).toBe('个人简介')
    // Crucial: bio label must NOT leak the textarea's existing textContent
    expect(bioField?.label).not.toContain('这是已有简介的内容')
    expect(bioField?.hasValue).toBe(true)

    // Passwords, hidden, and disabled must be excluded
    expect(snapshot.fields.some((f) => f.id === 'pwd')).toBe(false)
    expect(snapshot.fields.some((f) => f.id === 'disabled-input')).toBe(false)
  })

  it('safely fills empty fields by ID and refuses to overwrite non-empty fields', async () => {
    document.body.innerHTML = `
      <form id="apply-form">
        <label for="title">申请标题</label>
        <input id="title" type="text" value="" />

        <label for="desc">详细说明</label>
        <textarea id="desc"></textarea>

        <label for="existing">不可覆盖项</label>
        <input id="existing" type="text" value="已有重要内容" />
      </form>
    `

    const submitSpy = vi.fn()
    const form = document.getElementById('apply-form') as HTMLFormElement
    form.addEventListener('submit', submitSpy)

    // 1. Fill empty fields successfully
    const res1 = await fillFormFields(document, [
      { id: 'title', value: '新手创作者申请' },
      { id: 'desc', value: '申请加入创作者激励计划' },
    ])
    expect(res1.ok).toBe(true)

    const titleInput = document.getElementById('title') as HTMLInputElement
    const descTextarea = document.getElementById('desc') as HTMLTextAreaElement
    expect(titleInput.value).toBe('新手创作者申请')
    expect(descTextarea.value).toBe('申请加入创作者激励计划')
    // No submit should ever be fired
    expect(submitSpy).not.toHaveBeenCalled()

    // 2. Refuse to overwrite non-empty field
    const res2 = await fillFormFields(document, [
      { id: 'existing', value: '企图覆盖的内容' },
    ])
    expect(res2.ok).toBe(false)
    expect(res2.message).toContain('已有内容')
    const existingInput = document.getElementById('existing') as HTMLInputElement
    expect(existingInput.value).toBe('已有重要内容') // unchanged!
  })

  it('handles single body field targeting the primary empty editable area', async () => {
    document.body.innerHTML = `
      <div id="tweet-box">
        <textarea placeholder="有什么新鲜事？"></textarea>
      </div>
    `

    const res = await fillFormFields(document, [
      { id: 'body', value: '今天天气真好 #生活分享' },
    ])
    expect(res.ok).toBe(true)

    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea.value).toBe('今天天气真好 #生活分享')
  })

  it('filters Chinese sensitive fields (密码, 验证码)', () => {
    document.body.innerHTML = `
      <form>
        <input id="pwd-cn" placeholder="请输入密码" />
        <input id="sms-code" placeholder="输入短信验证码" />
        <input id="normal-cn" placeholder="输入昵称" />
      </form>
    `
    const snapshot = snapshotFormFields(document)
    expect(snapshot.fields.length).toBe(1)
    expect(snapshot.fields[0]?.id).toBe('normal-cn')
  })

  it('correctly associates unnamed inputs via data-draft-field-id and fills them', async () => {
    document.body.innerHTML = `
      <div>
        <input type="text" placeholder="无ID与Name的输入框" />
      </div>
    `
    const snapshot = snapshotFormFields(document)
    expect(snapshot.fields.length).toBe(1)
    const fieldId = snapshot.fields[0]!.id
    expect(fieldId).toMatch(/^field-\d+$/)

    const res = await fillFormFields(document, [{ id: fieldId, value: '成功回填无属性框' }])
    expect(res.ok).toBe(true)
    const input = document.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('成功回填无属性框')
  })

  it('supports filling select dropdowns without being blocked by initial selection', async () => {
    document.body.innerHTML = `
      <select id="country">
        <option value="CN">中国</option>
        <option value="US">美国</option>
      </select>
    `
    const res = await fillFormFields(document, [{ id: 'country', value: 'US' }])
    expect(res.ok).toBe(true)
    const select = document.getElementById('country') as HTMLSelectElement
    expect(select.value).toBe('US')
  })
})
