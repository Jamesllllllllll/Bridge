import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseChartDeepLink, findChartDeepLink } from '../src-electron/DeepLink.ts'
import { ChartLinkQueue } from '../src-shared/ChartLinkQueue.ts'
const a = 'a'.repeat(32), b = 'b'.repeat(32), c = 'c'.repeat(32)

test('only exact chart MD5 links are accepted and normalized', () => {
  assert.equal(parseChartDeepLink(`bridge://chart/${a.toUpperCase()}`), a)
  assert.equal(findChartDeepLink(['Bridge.exe', '--other', `bridge://chart/${b}`]), b)
  for (const value of ['', 'https://example.com', `bridge://chart/${a}?download=1`, `bridge://chart/${a}#x`, `bridge://user@chart/${a}`, `bridge://chart:80/${a}`, 'bridge://chart/../../file', `bridge://chart/${a}/`, 'bridge://chart/abcd', `bridge://search/${a}`]) {
    assert.equal(parseChartDeepLink(value), null, value)
  }
})

test('links wait for setup, process in order, and coalesce duplicate in-flight links', async () => {
  let ready = false
  const downloads = [], lookups = []
  let queue
  queue = new ChartLinkQueue({ready: () => ready, status() {}, download: chart => downloads.push(chart.md5), resolve: async hash => {
    lookups.push(hash)
    if(hash === a) { queue.add(a); queue.add(c); await queue.drain() }
    return [{md5: hash}]
  }})
  queue.add(a); queue.add(a.toUpperCase()); queue.add(b); queue.add('invalid')
  await queue.drain(); assert.deepEqual(downloads, [])
  ready = true; await queue.drain()
  assert.deepEqual(downloads, [a,b,c]); assert.deepEqual(lookups, [a,b,c])
})

test('never downloads a different hash; errors do not drop subsequent links and can be retried', async () => {
  const downloads = [], failures = []
  let fail = true
  const queue = new ChartLinkQueue({ready: () => true, status: (_, hash) => {if(hash) failures.push(hash)}, download: chart => downloads.push(chart.md5), resolve: async hash => {
    if(hash === a) return [{md5:b}]
    if(hash === b && fail) throw new Error('offline')
    return [{md5: hash}]
  }})
  queue.add(a); queue.add(b); queue.add(c); await queue.drain()
  assert.deepEqual(downloads, [c]); assert.deepEqual(failures,[a,b])
  fail = false; queue.add(b); await queue.drain(); assert.deepEqual(downloads,[c,b])
})
