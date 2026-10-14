import test from 'node:test'
import assert from 'node:assert/strict'
import { isPublicAddress, requestPublicStorage } from './public-http.js'

test('public address classification rejects private, mapped private, multicast and reserved addresses', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', 'bad-address']) assert.equal(isPublicAddress(address), false)
  assert.equal(isPublicAddress('8.8.8.8'), true)
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true)
})
test('cancellation ends a DNS wait without waiting for resolver completion', async () => {
  const controller = new AbortController()
  const pending = requestPublicStorage('https://storage.example.test', { signal: controller.signal }, () => new Promise(() => {}))
  controller.abort()
  const result = await Promise.race([pending.then(() => 'allowed', () => 'rejected'), new Promise(resolve => setTimeout(() => resolve('still-pending'), 20))])
  assert.equal(result, 'rejected')
})

test('mixed DNS answers and failed resolution reject before network connection', async () => {
  await assert.rejects(requestPublicStorage('https://storage.example.test', {}, async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]))
  await assert.rejects(requestPublicStorage('https://storage.example.test', {}, async () => []))
  await assert.rejects(requestPublicStorage('https://storage.example.test', {}, async () => { throw Error('no DNS') }))
  await assert.rejects(requestPublicStorage('http://storage.example.test'))
  await assert.rejects(requestPublicStorage('https://user:secret@storage.example.test'))
})
