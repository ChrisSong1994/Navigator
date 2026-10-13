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

const makeArea = (store) => ({
  async get(keys) {
    if (keys === null || keys === undefined) return Object.fromEntries(store)
    const list = Array.isArray(keys) ? keys : [keys]
    return Object.fromEntries(list.filter((key) => store.has(key)).map((key) => [key, store.get(key)]))
  },
  async set(entries) {
    for (const [key, value] of Object.entries(entries)) store.set(key, value)
  },
  async remove(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key)
  },
})

globalThis.chrome = {
  storage: {
    sync: makeArea(syncStore),
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
const { loadSnapshot, saveSnapshotNow, SYNC_MANIFEST_KEY } = await import('../src/config/storage.ts')

const config = {
  settings: { siteTitle: '新配置', siteLogo: '', primaryColor: '', linkFontSize: 14, linkCardGap: 16, themeMode: 'system', viewMode: 'card', searchEngine: 'google', searchOpenInNewTab: true, linkOpenInNewTab: true },
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
} catch (error) {
  console.error(`✗ 存储回归失败\n  ${error.stack ?? error.message}`)
  process.exitCode = 1
}
