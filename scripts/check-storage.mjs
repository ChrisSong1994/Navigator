#!/usr/bin/env node
/**
 * pnpm check:storage
 *
 * 存储层冒烟测试：用最小 chrome/localStorage mock 验证「local 完整快照优先于旧 sync」，
 * 这是“拉取书签后刷新又消失”的核心回归点。
 */
import assert from 'node:assert/strict'

const localStore = new Map()
const syncStore = new Map()

// 与 Chrome 实测一致：单项 = key 的 UTF-8 字节 + JSON.stringify(value) 的 UTF-8 字节，
// 引号 / 反斜杠的 JSON 转义也计入；总量 100 KB。mock 必须按这个口径拒写，
// 否则分片切大了（以前按原始字节切）测试依然全绿，直到用户收藏时看见 kQuotaBytesPerItem。
const SYNC_ITEM_LIMIT = 8 * 1024
const SYNC_TOTAL_LIMIT = 100 * 1024
const encoder = new TextEncoder()
const quotaBytes = (key, value) => encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length

const makeArea = (store, enforceQuota = false) => ({
  async get(keys) {
    if (keys === null || keys === undefined) return Object.fromEntries(store)
    const list = Array.isArray(keys) ? keys : [keys]
    return Object.fromEntries(list.filter((key) => store.has(key)).map((key) => [key, store.get(key)]))
  },
  async set(entries) {
    if (enforceQuota) {
      const next = new Map(store)
      for (const [key, value] of Object.entries(entries)) next.set(key, value)
      let total = 0
      for (const [key, value] of next) {
        const bytes = quotaBytes(key, value)
        if (bytes > SYNC_ITEM_LIMIT) throw new Error('Resource::kQuotaBytesPerItem quota exceeded')
        total += bytes
      }
      if (total > SYNC_TOTAL_LIMIT) throw new Error('Resource::kQuotaBytes quota exceeded')
    }
    for (const [key, value] of Object.entries(entries)) store.set(key, value)
  },
  async remove(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key)
  },
})

globalThis.chrome = {
  storage: {
    sync: makeArea(syncStore, true),
    local: makeArea(localStore),
    onChanged: { addListener() {} },
  },
}
globalThis.window = {
  localStorage: {
    getItem(key) { return localStore.has(`web:${key}`) ? localStore.get(`web:${key}`) : null },
    setItem(key, value) { localStore.set(`web:${key}`, String(value)) },
    removeItem(key) { localStore.delete(`web:${key}`) },
  },
}

const { createMeta } = await import('../src/config/merge.ts')
const { loadSnapshot, saveSnapshot, saveSnapshotNow, SyncWriteError, SYNC_CHUNK_PREFIX, SYNC_MANIFEST_KEY } = await import('../src/config/storage.ts')

const config = {
  settings: { siteTitle: '新配置', siteLogo: '', primaryColor: '', linkFontSize: 14, linkCardGap: 16, themeMode: 'system', viewMode: 'card', searchEngine: 'google', searchOpenInNewTab: true, linkOpenInNewTab: true, wallpaperMode: 'none', wallpaperUrl: '', wallpaperInterval: 60, wallpaperDim: 30, wallpaperBlur: 0 },
  groups: { default: { title: '常用', links: [{ icon: '', href: 'https://new.example', text: 'New' }] } },
}
const meta = createMeta(config)
meta.updatedAt = 10_000

// 模拟旧 sync 快照已经完整存在，但最新书签同步只写到了本机完整快照。
const oldConfig = {
  settings: config.settings,
  groups: { default: { title: '常用', links: [{ icon: '', href: 'https://old.example', text: 'Old' }] } },
}
const oldPayload = JSON.stringify({ config: oldConfig, meta: { ...meta, updatedAt: 1 } })
syncStore.set(`${SYNC_MANIFEST_KEY}`, { version: 1, revision: 'old', chunks: 1, updatedAt: 1_000 })
syncStore.set('navigator:sync:chunk:0', oldPayload)
localStore.set('web:navigator:config', JSON.stringify(config))
localStore.set('web:navigator:meta', JSON.stringify(meta))
localStore.set('web:navigator:updatedAt', JSON.stringify(meta.updatedAt))

try {
  const loaded = await loadSnapshot()
  assert.equal(loaded.config.groups.default.links[0].href, 'https://new.example', '旧的 sync 分片不能覆盖更新的本地完整快照')

  // 页面隐藏时的同步兜底也必须立即可读。
  const hiddenConfig = { ...config, groups: { default: { title: '常用', links: [{ icon: '', href: 'https://hidden.example', text: 'Hidden' }] } } }
  const hiddenMeta = { ...meta, updatedAt: 20_000 }
  saveSnapshotNow(hiddenConfig, hiddenMeta)
  const afterHide = await loadSnapshot()
  assert.equal(afterHide.config.groups.default.links[0].href, 'https://hidden.example', 'pagehide 同步兜底应立即生效')
  console.log('✓ 存储回归：更新的本地完整快照优先于旧 sync 分片')
  console.log('✓ 存储回归：pagehide 同步兜底立即生效')

  // 引号 / 反斜杠 / 中文都很多的大配置：原始 JSON 只有 ~73 KB，但 JSON 转义后 ~87 KB。
  // 旧的按原始 8000 字节切分会产生 9.6 KB 的分片，Chrome 直接拒绝；必须按转义后字节切。
  const heavyLinks = Array.from({ length: 600 }, (_, index) => ({
    icon: '',
    href: `https://example.com/heavy/${index}?q="a"\\b`,
    text: `中文 "引号" \\ 反斜杠 第 ${index} 条链接`,
  }))
  const heavyConfig = { settings: config.settings, groups: { default: { title: '常用', links: heavyLinks } } }
  const heavyMeta = { ...createMeta(heavyConfig), updatedAt: 30_000 }
  await saveSnapshot(heavyConfig, heavyMeta)

  const items = [...syncStore.entries()].map(([key, value]) => ({ key, bytes: quotaBytes(key, value) }))
  const oversize = items.filter((item) => item.bytes > SYNC_ITEM_LIMIT)
  assert.equal(
    oversize.length,
    0,
    `sync 单项超过 8 KB：${oversize.map((item) => `${item.key}=${item.bytes}`).join(', ')}`,
  )
  const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0)
  assert.ok(totalBytes <= SYNC_TOTAL_LIMIT, `sync 总量 ${totalBytes} 超过 100 KB`)

  const manifest = syncStore.get(SYNC_MANIFEST_KEY)
  const joined = Array.from({ length: manifest.chunks }, (_, index) => syncStore.get(`${SYNC_CHUNK_PREFIX}${index}`)).join('')
  assert.equal(JSON.parse(joined).config.groups.default.links.length, heavyLinks.length, '分片拼回来后应还原完整配置')
  console.log(`✓ 存储回归：转义密集的配置切成 ${manifest.chunks} 片，最大单项 ${Math.max(...items.map((item) => item.bytes))} 字节（上限 8192）`)

  // sync 写失败 / localStorage 被清掉时，chrome.storage.local 里的完整快照是最后一道防线。
  // 它存的是 JSON 文本，读取时必须先 JSON.parse —— 以前直接交给 parseConfig，永远得到 null。
  for (const key of [...localStore.keys()]) if (key.startsWith('web:')) localStore.delete(key)
  for (const key of [...syncStore.keys()]) syncStore.delete(key)
  const onlyLocal = await loadSnapshot()
  assert.equal(onlyLocal.config?.groups.default.links.length, heavyLinks.length, '只有 chrome.storage.local 快照时也要能读出配置')
  console.log('✓ 存储回归：localStorage / sync 都不可用时，chrome.storage.local 完整快照仍可读')

  // 总量超限：本机完整快照照常保存，sync 侧抛专用错误交给 UI 提示「只保存在本机」
  const hugeLinks = Array.from({ length: 2400 }, (_, index) => ({
    icon: '',
    href: `https://example.com/huge/${index}?q="a"\\b`,
    text: `中文 "引号" \\ 反斜杠 第 ${index} 条链接`,
  }))
  const hugeConfig = { settings: config.settings, groups: { default: { title: '常用', links: hugeLinks } } }
  const hugeMeta = { ...createMeta(hugeConfig), updatedAt: 40_000 }
  let quotaError = null
  try {
    await saveSnapshot(hugeConfig, hugeMeta)
  } catch (error) {
    quotaError = error
  }
  assert.ok(quotaError instanceof SyncWriteError, `sync 总量超限应抛 SyncWriteError，实际：${quotaError}`)
  assert.match(quotaError.message, /100 KB/)
  const localConfigText = localStore.get('navigator:config')
  assert.equal(JSON.parse(localConfigText).groups.default.links.length, hugeLinks.length, 'sync 失败时本机完整快照仍应写入')
  console.log('✓ 存储回归：sync 总量超限抛 SyncWriteError，本机完整快照不受影响')
} catch (error) {
  console.error(`✗ 存储回归失败\n  ${error.stack ?? error.message}`)
  process.exitCode = 1
}
