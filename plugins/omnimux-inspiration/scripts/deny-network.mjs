/**
 * Deny-all network harness for the omnimux-inspiration test suite.
 *
 * Proves the suite performs no real egress: DNS lookups, TCP connects, TLS
 * handshakes, and fetch are all replaced with throwing stubs before any test
 * module loads. A test that accidentally reaches the network fails loudly here
 * instead of silently passing on a machine that happens to be online.
 *
 * Run with: node --import ./scripts/deny-network.mjs --test src/*.test.js src/client/*.test.js
 */
import dns from 'node:dns'
import dnsPromises from 'node:dns/promises'
import net from 'node:net'
import tls from 'node:tls'
import http from 'node:http'
import https from 'node:https'

const DENIED = 'DENY-NETWORK: the test suite must not touch the real network'

const attempts = []

function deny(kind) {
  return (...args) => {
    // Record the attempt so the receipt can report exactly what tried to leave.
    attempts.push({ kind, host: typeof args[0] === 'string' ? args[0] : String(args[0] ?? '') })
    throw new Error(`${DENIED} (${kind})`)
  }
}

dns.lookup = deny('dns.lookup')
dns.resolve = deny('dns.resolve')
dns.resolve4 = deny('dns.resolve4')
dns.resolve6 = deny('dns.resolve6')
dnsPromises.lookup = async (...args) => deny('dns.promises.lookup')(...args)
dnsPromises.resolve = async (...args) => deny('dns.promises.resolve')(...args)

net.connect = deny('net.connect')
net.createConnection = deny('net.createConnection')
tls.connect = deny('tls.connect')
http.request = deny('http.request')
http.get = deny('http.get')
https.request = deny('https.request')
https.get = deny('https.get')

// Node's global fetch does its own DNS inside the runtime, so it is replaced
// outright: any test that expects a stub has installed one already.
globalThis.fetch = deny('fetch')

process.on('exit', (code) => {
  const line = attempts.length === 0
    ? 'DENY-NETWORK RECEIPT: 0 outbound attempts'
    : `DENY-NETWORK RECEIPT: ${attempts.length} outbound attempt(s) BLOCKED: ${JSON.stringify(attempts)}`
  process.stdout.write(`\n${line}\n`)
  if (attempts.length > 0 && code === 0) {
    process.exitCode = 1
  }
})
