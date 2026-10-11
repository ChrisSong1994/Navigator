/**
 * 配置持久化与导入导出。
 *
 * 扩展环境写入 chrome.storage.sync，让同一 Chrome 用户的不同设备自动同步；
 * 普通网页开发环境回退到 localStorage。config + meta 会一起序列化成分片快照，
 * 因此分组、外观、搜索引擎和墓碑记录都能同步，而不只同步书签。
 *
 *   navigator:config        普通网页开发环境：兼容旧数据 / 同步不可用时的本机快照
 *   navigator:meta          普通网页开发环境：兼容旧 meta
 *   navigator:sync:manifest 扩展环境：{ version, revision, chunks, updatedAt }
 *   navigator:sync:chunk:N  扩展环境：快照 JSON 的第 N 个分片
 */
import { renderBookmarksHtml } from './bookmarks.ts'
import { parseConfig, serializeConfig } from './schema.ts'
import type { NavConfig, NavGroup } from './schema.ts'
import type { LocalMeta } from './merge.ts'

export const CONFIG_KEY = 'navigator:config'
export const META_KEY = 'navigator:meta'
export const SYNC_MANIFEST_KEY = 'navigator:sync:manifest'
export const SYNC_CHUNK_PREFIX = 'navigator:sync:chunk:'
const UPDATED_AT_KEY = 'navigator:updatedAt'

/** chrome.storage.sync 单项上限 8 KB；留一点 JSON 包装余量 */
const SYNC_CHUNK_BYTES = 8_000
const SYNC_ITEM_LIMIT = 8 * 1024
const SYNC_SCHEMA_VERSION = 1

export interface SyncManifest {
  version: number
  /** 内容修订号；相同 revision 的 onChanged 是本页刚写入的回声，可忽略 */
  revision: string
  chunks: number
  updatedAt: number
}

interface SyncSnapshotPayload {
  config: NavConfig
  meta: LocalMeta
}

export interface LocalSnapshot {
  config: NavConfig | null
  meta: LocalMeta | null
  revision: string | null
  /** 快照写入时间；用于在两个存储区域都可用时选择较新的完整快照 */
  updatedAt: number
}

export type StorageArea = 'sync' | 'local'
export interface StorageChange {
  source: StorageArea
  /** 为 null 表示清空 / 无法读取；否则是完整的新快照 */
  snapshot: LocalSnapshot | null
}
export type StorageListener = (change: StorageChange) => void

const listeners = new Set<StorageListener>()
let lastLocalRevision = ''

function isExtensionStorageAvailable(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.sync && chrome.storage?.local)
}

export function storageMode(): StorageArea {
  return isExtensionStorageAvailable() ? 'sync' : 'local'
}

export function onStorageChange(listener: StorageListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notifyStorageChange(change: StorageChange): void {
  for (const listener of listeners) listener(change)
}

if (isExtensionStorageAvailable()) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' && areaName !== 'local') return
    const keys = Object.keys(changes)
    if (!keys.some((key) => key === CONFIG_KEY || key === META_KEY || key === SYNC_MANIFEST_KEY || key.startsWith(SYNC_CHUNK_PREFIX))) return

    // 同步事件回调里重新读完整快照，避免把只收到单个分片的中间态当成完整配置。
    void loadSnapshot()
      .then((snapshot) => {
        if (areaName === 'sync' && snapshot.revision && snapshot.revision === lastLocalRevision) return
        notifyStorageChange({ source: areaName, snapshot })
      })
      .catch(() => notifyStorageChange({ source: areaName, snapshot: null }))
  })
}

function readWebJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    // 隐私模式 / 本地数据被改坏，都当成“没有本地配置”
    return null
  }
}

function byteSize(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

/** 按 UTF-8 字节数切分，且按 Unicode code point 遍历，避免中文 / emoji 超限或拆坏代理对 */
function chunkText(text: string, maxBytes = SYNC_CHUNK_BYTES): string[] {
  const chunks: string[] = []
  let current: string[] = []
  let currentBytes = 0

  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0
    const charBytes = codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4
    if (current.length > 0 && currentBytes + charBytes > maxBytes) {
      chunks.push(current.join(''))
      current = []
      currentBytes = 0
    }
    current.push(char)
    currentBytes += charBytes
  }

  if (current.length > 0) chunks.push(current.join(''))
  return chunks.length > 0 ? chunks : ['']
}

function makeRevision(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${Date.now().toString(36)}-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function emptySnapshot(): LocalSnapshot {
  return { config: null, meta: null, revision: null, updatedAt: 0 }
}

function parseSnapshot(raw: unknown): LocalSnapshot {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as SyncSnapshotPayload | NavConfig
      if (parsed && typeof parsed === 'object' && 'config' in parsed && 'meta' in parsed) {
        const snapshot = parsed as SyncSnapshotPayload
        return { config: parseConfig(snapshot.config).config, meta: snapshot.meta, revision: null, updatedAt: 0 }
      }
      return { config: parseConfig(parsed).config, meta: null, revision: null, updatedAt: 0 }
    } catch {
      return emptySnapshot()
    }
  }
  if (raw && typeof raw === 'object' && 'config' in raw && 'meta' in raw) {
    const snapshot = raw as SyncSnapshotPayload
    return { config: parseConfig(snapshot.config).config, meta: snapshot.meta, revision: null, updatedAt: 0 }
  }
  return { config: raw === null || raw === undefined ? null : parseConfig(raw).config, meta: null, revision: null, updatedAt: 0 }
}

/** 两个存储区域都可能有完整快照；同一时刻优先本地，时间较新的优先。 */
function pickNewestSnapshot(...candidates: LocalSnapshot[]): LocalSnapshot {
  let best = emptySnapshot()
  for (const candidate of candidates) {
    if (!candidate.config) continue
    if (!best.config || candidate.updatedAt >= best.updatedAt) best = candidate
  }
  return best
}

function readWebSnapshot(): LocalSnapshot {
  const raw = readWebJson<unknown>(CONFIG_KEY)
  if (raw === null) return emptySnapshot()
  const config = parseConfig(raw).config
  const meta = readWebJson<LocalMeta>(META_KEY)
  const updatedAt = readWebJson<number>(UPDATED_AT_KEY)
  return { config, meta, revision: lastLocalRevision || null, updatedAt: updatedAt ?? meta?.updatedAt ?? 0 }
}

function writeWebSnapshot(configText: string, meta: LocalMeta, updatedAt: number): void {
  window.localStorage.setItem(CONFIG_KEY, configText)
  window.localStorage.setItem(META_KEY, JSON.stringify(meta))
  window.localStorage.setItem(UPDATED_AT_KEY, JSON.stringify(updatedAt))
}

function removeWebSnapshot(): void {
  window.localStorage.removeItem(CONFIG_KEY)
  window.localStorage.removeItem(META_KEY)
  window.localStorage.removeItem(UPDATED_AT_KEY)
}

function isManifest(value: unknown): value is SyncManifest {
  if (!value || typeof value !== 'object') return false
  const manifest = value as Partial<SyncManifest>
  return (
    typeof manifest.version === 'number' &&
    typeof manifest.revision === 'string' &&
    Number.isInteger(manifest.chunks) &&
    (manifest.chunks ?? 0) > 0 &&
    typeof manifest.updatedAt === 'number'
  )
}

async function readChromeLocalSnapshot(): Promise<LocalSnapshot> {
  const local = await chrome.storage.local.get([CONFIG_KEY, META_KEY, UPDATED_AT_KEY])
  const rawConfig = local[CONFIG_KEY]
  if (rawConfig === undefined) return emptySnapshot()
  const config = parseConfig(rawConfig).config
  const meta = (local[META_KEY] ?? null) as LocalMeta | null
  const updatedAt = local[UPDATED_AT_KEY]
  return { config, meta, revision: null, updatedAt: typeof updatedAt === 'number' ? updatedAt : meta?.updatedAt ?? 0 }
}

async function readSyncSnapshot(): Promise<LocalSnapshot> {
  // 本机完整快照先读出来：sync 分片写坏、配额不足或页面刚写入尚未同步时，
  // 它比旧的 sync manifest 新，应该以本机为准。
  const [chromeLocal, webLocal] = await Promise.all([readChromeLocalSnapshot(), Promise.resolve(readWebSnapshot())])
  let sync = emptySnapshot()

  try {
    const manifestResult = await chrome.storage.sync.get(SYNC_MANIFEST_KEY)
    const manifest = manifestResult[SYNC_MANIFEST_KEY]
    if (!isManifest(manifest)) {
      // 兼容旧版本直接放在 sync 下的 navigator:config；读出来后由 Provider 首次保存迁移为分片格式。
      const legacy = await chrome.storage.sync.get(CONFIG_KEY)
      if (legacy[CONFIG_KEY] !== undefined) sync = parseSnapshot(legacy[CONFIG_KEY])
    } else {
      const keys = Array.from({ length: manifest.chunks }, (_, index) => `${SYNC_CHUNK_PREFIX}${index}`)
      const chunkResult = await chrome.storage.sync.get(keys)
      const parts = keys.map((key) => chunkResult[key])
      if (parts.every((part) => typeof part === 'string')) {
        sync = { ...parseSnapshot(parts.join('')), revision: manifest.revision, updatedAt: manifest.updatedAt }
      }
    }
  } catch {
    // sync 读取失败不影响本机完整快照。
  }

  return pickNewestSnapshot(sync, chromeLocal, webLocal)
}

/** 只匹配本扩展自己的数字分片，不碰其他扩展键 */
function isSyncChunkKey(key: string): boolean {
  return /^navigator:sync:chunk:\d+$/.test(key)
}

/** 读取当前区域里的全部分片键，用于清理 manifest 不完整或中断写入留下的历史分片 */
async function listSyncChunkKeys(): Promise<string[]> {
  const all = await chrome.storage.sync.get(null)
  return Object.keys(all).filter(isSyncChunkKey)
}

async function writeSyncSnapshot(configText: string, meta: LocalMeta, updatedAt: number): Promise<void> {
  const payload: SyncSnapshotPayload = { config: JSON.parse(configText) as NavConfig, meta }
  const serialized = JSON.stringify(payload)
  const chunks = chunkText(serialized)
  chunks.forEach((chunk, index) => {
    if (byteSize(chunk) > SYNC_ITEM_LIMIT) throw new Error(`同步分片 ${index} 超过 chrome.storage.sync 单项 8 KB 限制`)
  })

  const revision = makeRevision(serialized)
  const manifest: SyncManifest = { version: SYNC_SCHEMA_VERSION, revision, chunks: chunks.length, updatedAt }

  // manifest 最后写入：只有所有分片都就位后，其它设备才可能把它当成完整快照读取。
  const entries: Record<string, unknown> = {}
  chunks.forEach((chunk, index) => {
    entries[`${SYNC_CHUNK_PREFIX}${index}`] = chunk
  })
  await chrome.storage.sync.set(entries)
  await chrome.storage.sync.set({ [SYNC_MANIFEST_KEY]: manifest })

  // 不只看旧 manifest 的 chunks：即使上一次写入在更新 manifest 前中断，也把高位历史分片清掉。
  const staleKeys = (await listSyncChunkKeys()).filter((key) => Number(key.slice(SYNC_CHUNK_PREFIX.length)) >= chunks.length)
  if (staleKeys.length > 0) await chrome.storage.sync.remove(staleKeys)

  lastLocalRevision = revision
}

async function removeSyncSnapshot(): Promise<void> {
  const staleKeys = await listSyncChunkKeys()
  await chrome.storage.sync.remove([CONFIG_KEY, META_KEY, SYNC_MANIFEST_KEY, ...staleKeys])
  lastLocalRevision = ''
  await chrome.storage.local.remove([CONFIG_KEY, META_KEY, UPDATED_AT_KEY])
}

export async function loadSnapshot(): Promise<LocalSnapshot> {
  if (!isExtensionStorageAvailable()) return readWebSnapshot()
  return readSyncSnapshot()
}

/** 兼容旧调用：开发环境同步读取，扩展环境返回 null，由 ConfigProvider 的异步初始化接管 */
export function loadLocal(): LocalSnapshot {
  if (isExtensionStorageAvailable()) return emptySnapshot()
  return readWebSnapshot()
}

function snapshotUpdatedAt(meta: LocalMeta): number {
  return Math.max(Date.now(), meta.updatedAt || 0)
}

export async function saveSnapshot(config: NavConfig, meta: LocalMeta): Promise<void> {
  const configText = serializeConfig(config, 0)
  const updatedAt = snapshotUpdatedAt(meta)

  if (!isExtensionStorageAvailable()) {
    writeWebSnapshot(configText, meta, updatedAt)
    return
  }

  // 新标签页随时可能被关闭：先同步写 localStorage 兜底，再写 chrome.storage.local / sync。
  // 即便页面在异步 API 完成前卸载，下一次启动也能从这份完整快照恢复。
  try {
    writeWebSnapshot(configText, meta, updatedAt)
  } catch {
    // 隐私策略 / 配额可能阻止 localStorage；继续走扩展存储。
  }

  // 完整快照先写到 local：sync 有 8 KB 分片与总量配额，失败时不能让刚导入的配置丢失。
  await chrome.storage.local.set({
    [CONFIG_KEY]: configText,
    [META_KEY]: meta,
    [UPDATED_AT_KEY]: updatedAt,
  })
  await writeSyncSnapshot(configText, meta, updatedAt)
}

/** pagehide / 页面隐藏时的同步兜底；不等待 chrome.storage 的异步写入。 */
export function saveSnapshotNow(config: NavConfig, meta: LocalMeta): void {
  const configText = serializeConfig(config, 0)
  const updatedAt = snapshotUpdatedAt(meta)
  if (!isExtensionStorageAvailable()) {
    writeWebSnapshot(configText, meta, updatedAt)
    return
  }
  try {
    writeWebSnapshot(configText, meta, updatedAt)
  } catch {
    // 页面正在卸载，无法可靠展示错误；异步保存仍会在后台继续尝试。
  }
}

export async function clearSnapshot(): Promise<void> {
  if (!isExtensionStorageAvailable()) {
    removeWebSnapshot()
    lastLocalRevision = ''
    return
  }
  await removeSyncSnapshot()
}

/** @deprecated 使用 saveSnapshot，保留同步名称给旧测试 / 调用方 */
export function saveLocal(config: NavConfig, meta: LocalMeta): void {
  if (isExtensionStorageAvailable()) return
  writeWebSnapshot(serializeConfig(config, 0), meta, Date.now())
}

/** @deprecated 使用 clearSnapshot */
export function clearLocal(): void {
  if (isExtensionStorageAvailable()) return
  removeWebSnapshot()
}

function download(filename: string, text: string, type: string): string {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
  return filename
}

/** 导出成 json 文件，结构与 global_original.json5 一致（可直接替换它，也可以再导入回来） */
export function exportConfigFile(config: NavConfig): string {
  const filename = `navigator-config-${new Date().toISOString().slice(0, 10)}.json`
  return download(filename, `${serializeConfig(config)}\n`, 'application/json')
}

/** 导出成 Chrome 能导入的书签 HTML（书签管理器 → 导入书签和设置） */
export function exportBookmarksFile(groups: Record<string, NavGroup>): string {
  const filename = `navigator-bookmarks-${new Date().toISOString().slice(0, 10)}.html`
  return download(filename, renderBookmarksHtml(groups), 'text/html;charset=utf-8')
}

export class ImportError extends Error {}

/** 校验一段配置 JSON 文本（与导出、与 src/global_runtime.json 同结构）；纯函数，UI 预览里可同步调用 */
export function readConfigText(text: string): NavConfig {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new ImportError(
      `文件不是合法的 JSON：${(error as Error).message}（json5 源配置请先执行 pnpm refresh，或导出为 JSON 后再导入）`,
    )
  }
  const { config, errors } = parseConfig(raw)
  if (!config) throw new ImportError(errors.join('\n'))
  return config
}
