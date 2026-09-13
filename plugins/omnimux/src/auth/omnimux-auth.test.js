import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CLIENT_NAME,
  CREDENTIAL_REF,
  DEFAULT_SITE,
  parseDeviceCodeResponse,
  parseDeviceTokenResponse,
  publicStatus,
  resolveSiteBaseUrl,
  stripProfile,
} from './omnimux-auth.js'

describe('omnimux auth parsing', () => {
  it('keeps the access-token credential name distinct from the video sk- env', () => {
    assert.equal(CREDENTIAL_REF, 'OMNIMUX_ACCESS_TOKEN')
    assert.notEqual(CREDENTIAL_REF, 'OMNIMUX_TOKEN')
    assert.equal(CLIENT_NAME, 'omnimux')
    assert.equal(resolveSiteBaseUrl(undefined), DEFAULT_SITE)
    assert.equal(resolveSiteBaseUrl('https://omnimux.ai/'), 'https://omnimux.ai')
  })

  it('strips secrets and non-public self fields', () => {
    const profile = stripProfile({
      id: 7,
      username: 'ada',
      display_name: 'Ada',
      group: 'default',
      quota: 1_000_000,
      used_quota: 250_000,
      email: 'ada@example.com',
      access_token: 'pat-secret',
      aff_code: 'AFF',
      permissions: { admin: true },
      stripe_customer: 'cus_x',
      setting: { foo: 1 },
    })
    assert.deepEqual(profile, {
      id: 7,
      username: 'ada',
      display_name: 'Ada',
      group: 'default',
      quota_usd: 2,
      used_quota_usd: 0.5,
    })
    const dumped = JSON.stringify(profile)
    assert.equal(/access_token|pat-secret|sk-|ada@example|AFF|cus_x/.test(dumped), false)
  })

  it('parses role and sets is_admin for admin and common users', () => {
    const admin = stripProfile({ id: 1, username: 'root', role: 10 })
    assert.equal(admin.role, 10)
    assert.equal(admin.is_admin, true)

    const superAdmin = stripProfile({ id: 2, username: 'owner', role: 100 })
    assert.equal(superAdmin.role, 100)
    assert.equal(superAdmin.is_admin, true)

    const common = stripProfile({ id: 3, username: 'guest', role: 1 })
    assert.equal(common.role, 1)
    assert.equal(common.is_admin, false)
  })

  it('parses device code and token outcomes', () => {
    const started = parseDeviceCodeResponse({
      success: true,
      data: {
        device_code: 'dev-1',
        user_code: 'ABCD',
        verification_uri_complete: 'https://omnimux.ai/cli/login?code=ABCD',
        expires_in: 900,
        interval: 5,
      },
    })
    assert.equal(started.ok, true)
    assert.equal(started.deviceCode, 'dev-1')

    assert.equal(parseDeviceTokenResponse({
      success: true,
      data: { access_token: 'pat-xyz', user_id: 1, username: 'ada' },
    }).kind, 'success')
    assert.equal(parseDeviceTokenResponse({ code: 'authorization_pending' }).kind, 'pending')
    assert.equal(parseDeviceTokenResponse({ code: 'slow_down', interval: 8 }).kind, 'slow_down')
    assert.equal(parseDeviceTokenResponse({ code: 'access_denied' }).kind, 'denied')
    assert.equal(parseDeviceTokenResponse({ code: 'expired_token' }).kind, 'expired')
  })

  it('public status never includes a token field', () => {
    const body = publicStatus({
      loggedIn: true,
      verified: true,
      siteBaseUrl: DEFAULT_SITE,
      profile: stripProfile({ id: 1, username: 'ada', quota: 0, used_quota: 0 }),
    })
    assert.equal(body.logged_in, true)
    assert.equal(body.username, 'ada')
    assert.equal('access_token' in body, false)
    assert.equal(/access_token|sk-/.test(JSON.stringify(body)), false)
  })
})
