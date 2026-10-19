/**
 * 扩展弹窗侧的配置读写。
 *
 * 和页面共用同一份存储与合并规则（config/storage.ts + config/merge.ts），但没有复用
 * config/ConfigProvider.tsx —— 那个 Provider 是给整页用的，带防抖保存、pagehide 兜底、
 * storage 变更监听，而且首帧会先画一版内置配置再跳到用户配置；弹窗只活几秒，那一闪很难看。
 *
 * 这里的规矩就一条：每个动作都「重新读最新快照 → 合并内置配置 → 就地改 → 整份写回」。
 * 读-改-写贴着动作走，所以页面那边同时在写时被覆盖的窗口只有几毫秒（这个限制记在 README）。
 *
 * 写是串行的：连点两次主题切换、或收藏后马上取消收藏，都不能让两份快照交叉写入。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addFavorite, removeFavorite } from '../../config/favorite.ts'
import { createGroup } from '../../config/group.ts'
import { mergeWithRuntime } from '../../config/merge.ts'
import type { LocalMeta } from '../../config/merge.ts'
import { RUNTIME_CONFIG } from '../../config/runtime.ts'
import { DEFAULT_CONFIG } from '../../config/schema.ts'
import type { NavConfig, NavGroup, NavLink, NavSettings } from '../../config/schema.ts'
import { loadSnapshot, saveSnapshot } from '../../config/storage.ts'

/** 一次改动的结果；changed 为 false 表示没什么可改的（分组不存在、已经收藏过……），不用写盘 */
interface Mutation<T> {
  config: NavConfig
  meta: LocalMeta
  changed: boolean
  value?: T
}

type Mutator<T> = (config: NavConfig, meta: LocalMeta) => Mutation<T>

export interface PopupConfigStore {
  /** 首次读取完成；未完成前弹窗只画骨架 */
  ready: boolean
  error: string | null
  settings: NavSettings
  groups: Record<string, NavGroup>
  groupIds: string[]
  /** 收藏到指定分组；返回这次是否真的写进去了 */
  favorite: (groupId: string, link: NavLink) => Promise<boolean>
  /** 从指定分组取消收藏；返回这次是否真的摘掉了 */
  unfavorite: (groupId: string, href: string) => Promise<boolean>
  /** 新建分组并把链接放进去，返回新分组 id */
  createGroupWithFavorite: (title: string, link: NavLink) => Promise<string | null>
  updateSettings: (patch: Partial<NavSettings>) => void
  dismissError: () => void
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function usePopupConfig(): PopupConfigStore {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<NavConfig>(DEFAULT_CONFIG)
  /** 串行写队列；前一个写失败也不能把后面的卡住 */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())

  /** 读最新快照，并按与页面相同的规则合并内置配置 */
  const readLatest = useCallback(async () => {
    const snapshot = await loadSnapshot()
    return mergeWithRuntime(RUNTIME_CONFIG, snapshot.config, snapshot.meta)
  }, [])

  useEffect(() => {
    let cancelled = false
    void readLatest()
      .then((merged) => {
        if (cancelled) return
        setConfig(merged.config)
        setReady(true)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setError(`读取配置失败：${messageOf(reason)}`)
        setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [readLatest])

  /** 提交一次改动；出错返回 undefined（错误文案进 error） */
  const commit = useCallback(
    async <T,>(mutator: Mutator<T>): Promise<Mutation<T> | undefined> => {
      const task = queueRef.current.then(async () => {
        const merged = await readLatest()
        const next = mutator(merged.config, merged.meta)
        if (next.changed) await saveSnapshot(next.config, next.meta)
        // 没有改动也把刚读到的配置铺到界面上：可能别的窗口刚改过
        setConfig(next.changed ? next.config : merged.config)
        return next
      })
      queueRef.current = task.catch(() => undefined)
      try {
        const result = await task
        setError(null)
        return result
      } catch (reason) {
        setError(`保存配置失败：${messageOf(reason)}`)
        return undefined
      }
    },
    [readLatest],
  )

  const favorite = useCallback(
    async (groupId: string, link: NavLink) => {
      const result = await commit((current, meta) => addFavorite(current, meta, groupId, link, RUNTIME_CONFIG))
      return result?.changed ?? false
    },
    [commit],
  )

  const unfavorite = useCallback(
    async (groupId: string, href: string) => {
      const result = await commit((current, meta) => removeFavorite(current, meta, groupId, href, RUNTIME_CONFIG))
      return result?.changed ?? false
    },
    [commit],
  )

  const createGroupWithFavorite = useCallback(
    async (title: string, link: NavLink) => {
      const result = await commit((current, meta) => {
        const created = createGroup(current, meta, title)
        const filled = addFavorite(created.config, created.meta, created.id, link, RUNTIME_CONFIG)
        return { ...filled, value: created.id }
      })
      return result?.value ?? null
    },
    [commit],
  )

  const updateSettings = useCallback(
    (patch: Partial<NavSettings>) => {
      // 主题 / 展示模式要立刻生效：先乐观更新界面，再走一次读-改-写落盘
      setConfig((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
      void commit((current, meta) => ({
        config: { ...current, settings: { ...current.settings, ...patch } },
        meta,
        changed: true,
      }))
    },
    [commit],
  )

  const dismissError = useCallback(() => setError(null), [])

  return useMemo(
    () => ({
      ready,
      error,
      settings: config.settings,
      groups: config.groups,
      groupIds: Object.keys(config.groups),
      favorite,
      unfavorite,
      createGroupWithFavorite,
      updateSettings,
      dismissError,
    }),
    [ready, error, config, favorite, unfavorite, createGroupWithFavorite, updateSettings, dismissError],
  )
}
