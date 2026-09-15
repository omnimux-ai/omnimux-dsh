import { describe, expect, it, vi } from 'vitest'
import { isNonPublicAddress, publicLookup, NonPublicAddressError } from '../src/public-media-transport.ts'

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
