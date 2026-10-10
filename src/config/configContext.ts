/** 配置 context 与读取 hook（与 Provider 分文件，保持 fast refresh 友好） */
import { createContext, useContext } from 'react'
import type { NavConfig, NavGroup, NavLink, NavSettings } from './schema.ts'

export interface ConfigContextValue {
  config: NavConfig
  settings: NavSettings
  groups: Record<string, NavGroup>
  groupIds: string[]
  linkCount: number
  /** 内置配置有更新被合并进来（首次用内置配置初始化时不算） */
  mergeNotice: boolean
  storageError: string | null
  dismissMergeNotice: () => void
  updateSettings: (patch: Partial<NavSettings>) => void
  /** 新建分组，返回新分组 id（不传标题则用「新分组 N」） */
  addGroup: (title?: string) => string
  renameGroup: (groupId: string, title: string) => void
  moveGroup: (groupId: string, offset: -1 | 1) => void
  removeGroup: (groupId: string) => void
  addLink: (groupId: string, link: NavLink) => void
  updateLink: (groupId: string, href: string, patch: Partial<NavLink>) => void
  moveLink: (groupId: string, href: string, offset: -1 | 1) => void
  /** 拖拽排序：把 fromGroupId 的第 fromIndex 条移动到 toGroupId 的 toIndex 位置 */
  moveLinkTo: (fromGroupId: string, fromIndex: number, toGroupId: string, toIndex: number) => void
  removeLink: (groupId: string, href: string) => void
  importConfig: (file: File) => Promise<void>
  exportConfig: () => void
  /** 用内置配置重新合并（会把内置配置里删掉的项恢复回来，本地内容保留） */
  remargeRuntime: () => void
  /** 清空本地，完全回到内置配置 */
  resetToRuntime: () => void
}

export const ConfigContext = createContext<ConfigContextValue | null>(null)

export function useConfig(): ConfigContextValue {
  const value = useContext(ConfigContext)
  if (!value) throw new Error('useConfig 必须在 ConfigProvider 内部使用')
  return value
}
