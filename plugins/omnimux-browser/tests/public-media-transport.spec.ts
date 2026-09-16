import { describe, expect, it, vi } from 'vitest'
import { isLocalAddress, isNonPublicAddress, publicLookup, NonPublicAddressError } from '../src/public-media-transport.ts'

describe('connection-bound public DNS', () => {
  it.each(['127.0.0.1', '100.64.1.1', '198.18.0.1', '192.0.2.4', '203.0.113.1', '240.0.0.1', '::1', '::ffff:8.8.8.8', '2001:2::1', '2001:db8::1', '2002:0808:0808::1', 'localhost.'])('refuses %s', (address) => {
    expect(isNonPublicAddress(address)).toBe(true)
  })
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', 'media.example.com'])('admits %s', (address) => {
    expect(isNonPublicAddress(address)).toBe(false)
  })
  it('fails the connection lookup for mixed public/private DNS', async () => {
    const resolve = vi.fn(async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.1.2.3', family: 4 }])
    const callback = vi.fn()
    publicLookup(resolve)('cdn.example', { all: true }, callback)
    await vi.waitFor(() => expect(callback).toHaveBeenCalled())
    expect(callback.mock.calls[0]?.[0]).toBeInstanceOf(NonPublicAddressError)
    expect(callback.mock.calls[0]?.[1]).toEqual([])
  })
  it('passes only the exact checked addresses to the connecting socket once', async () => {
    const addresses = [{ address: '8.8.8.8', family: 4 }, { address: '2606:4700::1111', family: 6 }]
    const resolve = vi.fn().mockResolvedValueOnce(addresses).mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    const callback = vi.fn()
    publicLookup(resolve)('cdn.example', { all: true }, callback)
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(null, addresses))
    expect(resolve).toHaveBeenCalledTimes(1)
  })
  it('supports the single-address Node socket lookup contract', async () => {
    const callback = vi.fn()
    publicLookup(async () => [{ address: '8.8.8.8', family: 4 }])('cdn.example', {}, callback)
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4))
  })
})

/**
 * The reserved ranges are no destination, but they are not the user's network
 * either: a transparent proxy in front of the machine answers every public name
 * out of one of them (measured: `pbs.twimg.com` → `198.18.35.226`). Refusing
 * them here refused every public hostname on such a machine, so the two checks
 * have to differ — the URL check stays strict, the answer check is about where
 * the answer can lead.
 */
describe('reserved resolver answers versus named URLs', () => {
  it.each([
    ['198.18.35.226', 4],
    ['198.18.0.1', 4],
    ['203.0.113.1', 4],
    ['2001:db8::1', 6],
    ['2002:0808:0808::1', 6],
  ] as const)('dials the proxy fake address %s the resolver answered with', async (address, family) => {
    const addresses = [{ address, family }]
    const callback = vi.fn()
    publicLookup(async () => addresses)('cdn.example', { all: true }, callback)
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(null, addresses))
  })

  it.each(['198.18.0.1', '198.18.35.226', '203.0.113.1', '2001:db8::1'])('still refuses a URL that names %s itself', (address) => {
    expect(isNonPublicAddress(address)).toBe(true)
    expect(isLocalAddress(address)).toBe(false)
  })

  it('keeps 192.0.2.0/24 on the local side, as the 192.0.0.0/16 rule already decided', () => {
    expect(isNonPublicAddress('192.0.2.4')).toBe(true)
    expect(isLocalAddress('192.0.2.4')).toBe(true)
  })

  it.each(['127.0.0.1', '10.1.2.3', '169.254.1.1', '100.64.1.1', '192.168.1.1', '::1', 'fd00::1', 'fe80::1', '::ffff:8.8.8.8'])('refuses the resolver answer %s, which leads onto the local network', async (address) => {
    const callback = vi.fn()
    publicLookup(async () => [{ address, family: address.includes(':') ? 6 : 4 }])('cdn.example', { all: true }, callback)
    await vi.waitFor(() => expect(callback).toHaveBeenCalled())
    expect(callback.mock.calls[0]?.[0]).toBeInstanceOf(NonPublicAddressError)
    expect(callback.mock.calls[0]?.[1]).toEqual([])
    expect(isLocalAddress(address)).toBe(true)
  })
})
