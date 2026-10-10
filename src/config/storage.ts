/**
 * localStorage 读写与配置文件的导入导出。
 *
 * 两个 key：
 *   navigator:config  配置本体，结构与 global_original.json5 / src/global_runtime.json 完全一致
 *   navigator:meta    合并记账（内置配置 hash、墓碑），不参与导出
 */
import { renderBookmarksHtml } from './bookmarks.ts'
import { parseConfig, serializeConfig } from './schema.ts'
import type { NavConfig, NavGroup } from './schema.ts'
import type { LocalMeta } from './merge.ts'

export const CONFIG_KEY = 'navigator:config'
export const META_KEY = 'navigator:meta'

export interface LocalSnapshot {
  config: NavConfig | null
  meta: LocalMeta | null
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    // 隐私模式 / 数据被别的程序改坏，都当成"没有本地配置"
    return null
  }
}

export function loadLocal(): LocalSnapshot {
  const rawConfig = readJson<unknown>(CONFIG_KEY)
  const parsed = rawConfig === null ? null : parseConfig(rawConfig).config
  return { config: parsed, meta: readJson<LocalMeta>(META_KEY) }
}

export function saveLocal(config: NavConfig, meta: LocalMeta): void {
  window.localStorage.setItem(CONFIG_KEY, serializeConfig(config, 0))
  window.localStorage.setItem(META_KEY, JSON.stringify(meta))
}

export function clearLocal(): void {
  window.localStorage.removeItem(CONFIG_KEY)
  window.localStorage.removeItem(META_KEY)
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
