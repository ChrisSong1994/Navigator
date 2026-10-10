/**
 * 配置状态：内置配置 + localStorage 合并后，向页面提供配置与全部编辑动作。
 * 所有改动都会即时写回 localStorage（防抖 300ms）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ConfigContext } from './configContext.ts'
import type { ConfigContextValue, ImportMode, ImportPayload, ImportResult } from './configContext.ts'
import { createMeta, linkKey, mergeImported, mergeWithRuntime, replacementTombstones } from './merge.ts'
import type { LocalMeta } from './merge.ts'
import { RUNTIME_CONFIG } from './runtime.ts'
import { parseConfig } from './schema.ts'
import type { NavConfig, NavGroup, NavLink, NavSettings } from './schema.ts'
import { clearLocal, exportBookmarksFile, exportConfigFile, loadLocal, saveLocal } from './storage.ts'

interface ConfigState {
  config: NavConfig
  meta: LocalMeta
  /** 内置配置有更新被合并进来（首次用内置配置初始化时不算） */
  notice: boolean
}

function moveInArray<T>(list: T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset
  if (index < 0 || target < 0 || target >= list.length) return list
  const next = [...list]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

function moveInRecord(groups: Record<string, NavGroup>, id: string, offset: -1 | 1): Record<string, NavGroup> {
  const entries = Object.entries(groups)
  const index = entries.findIndex(([key]) => key === id)
  if (index < 0) return groups
  return Object.fromEntries(moveInArray(entries, index, offset))
}

function initialState(): ConfigState {
  const { config: local, meta } = loadLocal()
  const result = mergeWithRuntime(RUNTIME_CONFIG, local, meta)
  // 本地空 → 用内置配置初始化，不算"合并"，不打扰用户
  return { config: result.config, meta: result.meta, notice: local !== null && result.merged }
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfigState>(initialState)
  const [storageError, setStorageError] = useState<string | null>(null)
  const { config, meta } = state

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        saveLocal(config, meta)
        setStorageError(null)
      } catch (error) {
        setStorageError(`配置写入浏览器本地存储失败：${(error as Error).message}`)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [config, meta])

  const mutateGroups = useCallback(
    (
      recipe: (groups: Record<string, NavGroup>) => Record<string, NavGroup>,
      /** 第二个参数是改动前的分组，用来在补墓碑时反查被搬走 / 删掉的那条链接 */
      metaPatch?: (meta: LocalMeta, before: Record<string, NavGroup>) => LocalMeta,
    ) => {
      setState((prev) => ({
        ...prev,
        config: { ...prev.config, groups: recipe(prev.config.groups) },
        meta: metaPatch ? metaPatch(prev.meta, prev.config.groups) : prev.meta,
      }))
    },
    [],
  )

  const updateSettings = useCallback((patch: Partial<NavSettings>) => {
    setState((prev) => ({ ...prev, config: { ...prev.config, settings: { ...prev.config.settings, ...patch } } }))
  }, [])

  const addGroup = useCallback((title?: string) => {
    const { groups } = config
    let index = Object.keys(groups).length + 1
    while (groups[`group-${index}`]) index += 1
    const id = `group-${index}`
    const groupTitle = title?.trim() || `新分组 ${index}`
    setState((prev) => ({
      ...prev,
      config: { ...prev.config, groups: { ...prev.config.groups, [id]: { title: groupTitle, links: [] } } },
      meta: { ...prev.meta, deletedGroups: prev.meta.deletedGroups.filter((deleted) => deleted !== id) },
    }))
    return id
  }, [config])

  const renameGroup = useCallback((groupId: string, title: string) => {
    mutateGroups((groups) => (groups[groupId] ? { ...groups, [groupId]: { ...groups[groupId], title } } : groups))
  }, [mutateGroups])

  const moveGroup = useCallback((groupId: string, offset: -1 | 1) => {
    mutateGroups((groups) => moveInRecord(groups, groupId, offset))
  }, [mutateGroups])

  const setGroupOrder = useCallback((ids: string[]) => {
    mutateGroups((groups) => {
      if (ids.length !== Object.keys(groups).length) return groups
      const ordered: Record<string, NavGroup> = {}
      for (const id of ids) {
        if (!groups[id]) return groups
        ordered[id] = groups[id]
      }
      return ordered
    })
  }, [mutateGroups])

  const removeGroup = useCallback((groupId: string) => {
    mutateGroups(
      (groups) => Object.fromEntries(Object.entries(groups).filter(([id]) => id !== groupId)),
      (metaPrev) =>
        groupId in RUNTIME_CONFIG.groups
          ? { ...metaPrev, deletedGroups: [...new Set([...metaPrev.deletedGroups, groupId])] }
          : metaPrev,
    )
  }, [mutateGroups])

  const addLink = useCallback((groupId: string, link: NavLink) => {
    mutateGroups(
      (groups) =>
        groups[groupId] ? { ...groups, [groupId]: { ...groups[groupId], links: [...groups[groupId].links, link] } } : groups,
      (metaPrev) => ({ ...metaPrev, deletedLinks: metaPrev.deletedLinks.filter((key) => key !== linkKey(groupId, link.href)) }),
    )
  }, [mutateGroups])

  const updateLink = useCallback((groupId: string, href: string, patch: Partial<NavLink>) => {
    mutateGroups((groups) => {
      const group = groups[groupId]
      if (!group) return groups
      const nextHref = patch.href ?? href
      return {
        ...groups,
        [groupId]: {
          ...group,
          links: group.links.map((link) => (link.href === href ? { ...link, ...patch, href: nextHref } : link)),
        },
      }
    })
  }, [mutateGroups])

  const moveLink = useCallback((groupId: string, href: string, offset: -1 | 1) => {
    mutateGroups((groups) => {
      const group = groups[groupId]
      if (!group) return groups
      const index = group.links.findIndex((link) => link.href === href)
      if (index < 0) return groups
      return { ...groups, [groupId]: { ...group, links: moveInArray(group.links, index, offset) } }
    })
  }, [mutateGroups])

  /**
   * 拖拽排序：把 fromGroupId 的第 fromIndex 条移动到 toGroupId 的 toIndex 位置。
   * toIndex 是"从来源里摘掉之后"的插入下标，同组内拖到第 j 条上正好等于 j，因此前后拖动都符合直觉。
   */
  const moveLinkTo = useCallback(
    (fromGroupId: string, fromIndex: number, toGroupId: string, toIndex: number) => {
      mutateGroups(
        (groups) => {
          const from = groups[fromGroupId]
          const to = groups[toGroupId]
          if (!from || !to) return groups
          if (fromIndex < 0 || fromIndex >= from.links.length) return groups
          if (fromGroupId === toGroupId && fromIndex === toIndex) return groups

          if (fromGroupId === toGroupId) {
            const links = [...from.links]
            const [item] = links.splice(fromIndex, 1)
            links.splice(Math.max(0, Math.min(toIndex, links.length)), 0, item)
            return { ...groups, [fromGroupId]: { ...from, links } }
          }

          const fromLinks = [...from.links]
          const [item] = fromLinks.splice(fromIndex, 1)
          const toLinks = [...to.links]
          toLinks.splice(Math.max(0, Math.min(toIndex, toLinks.length)), 0, item)
          return { ...groups, [fromGroupId]: { ...from, links: fromLinks }, [toGroupId]: { ...to, links: toLinks } }
        },
        (metaPrev, before) => {
          if (fromGroupId === toGroupId) return metaPrev
          // 跨分组搬走等于"从原分组删掉"，不然下次合并会把内置配置里那一份又塞回去
          const href = before[fromGroupId]?.links[fromIndex]?.href
          if (!href) return metaPrev
          if (!RUNTIME_CONFIG.groups[fromGroupId]?.links.some((link) => link.href === href)) return metaPrev
          return { ...metaPrev, deletedLinks: [...new Set([...metaPrev.deletedLinks, linkKey(fromGroupId, href)])] }
        },
      )
    },
    [mutateGroups],
  )

  const removeLink = useCallback((groupId: string, href: string) => {
    mutateGroups(
      (groups) => {
        const group = groups[groupId]
        if (!group) return groups
        return { ...groups, [groupId]: { ...group, links: group.links.filter((link) => link.href !== href) } }
      },
      (metaPrev) => {
        const inRuntime = RUNTIME_CONFIG.groups[groupId]?.links.some((link) => link.href === href)
        return inRuntime ? { ...metaPrev, deletedLinks: [...new Set([...metaPrev.deletedLinks, linkKey(groupId, href)])] } : metaPrev
      },
    )
  }, [mutateGroups])

  /**
   * 落地一份上传内容。
   *
   * 合并：保留现有 meta（runtimeHash / baseSettings 不动），只清掉本次重新引入的墓碑 —— 不清的话
   *   刚导进来的分组会被 deletedGroups 拦掉（mergeWithRuntime 两个循环都 continue）、链接会被
   *   deletedLinks 过滤掉，下次内置配置一变就凭空消失。与 addGroup / addLink 的做法一致。
   * 替换：重建 meta，并把「替换内容里没有的内置分组 / 链接」全记成墓碑 —— 「全部替换成新的」意味着
   *   现在这份就是全部，之后内置配置变动不该把用户刚换掉的内容又并回来（要拿回内置内容有专门的
   *   「恢复内置配置」按钮）。
   */
  const applyImport = useCallback((payload: ImportPayload, mode: ImportMode): ImportResult => {
    const current = state.config

    if (mode === 'replace') {
      const { config: replaced, errors } = parseConfig({
        settings: payload.settings ?? current.settings,
        groups: payload.groups,
      })
      if (!replaced) throw new Error(errors.join('\n'))
      // 空配置在 schema 里只是警告，但让它落地就会把整页清空 —— 这里挡掉
      if (Object.keys(replaced.groups).length === 0) throw new Error('文件里没有任何分组，已取消替换')

      setState({
        config: replaced,
        meta: { ...createMeta(RUNTIME_CONFIG), ...replacementTombstones(RUNTIME_CONFIG, replaced.groups) },
        notice: false,
      })

      return {
        mode,
        addedGroups: Object.keys(replaced.groups).length,
        addedLinks: Object.values(replaced.groups).reduce((total, group) => total + group.links.length, 0),
        skippedLinks: 0,
      }
    }

    const merged = mergeImported(current.groups, payload.groups)
    const touchedGroups = new Set(merged.touchedGroupIds)
    const touchedLinks = new Set(merged.touchedLinkKeys)

    setState((prev) => ({
      ...prev,
      config: { ...prev.config, groups: merged.groups },
      meta: {
        ...prev.meta,
        deletedGroups: prev.meta.deletedGroups.filter((id) => !touchedGroups.has(id)),
        deletedLinks: prev.meta.deletedLinks.filter((key) => !touchedLinks.has(key)),
        updatedAt: Date.now(),
      },
      notice: false,
    }))

    return {
      mode,
      addedGroups: merged.addedGroupIds.length,
      addedLinks: merged.addedLinks.length,
      skippedLinks: merged.skippedLinks,
    }
    // state 作为依赖：合并要基于最新配置算，替换要拿当前 settings 兜底
  }, [state])

  const exportConfig = useCallback(() => {
    exportConfigFile(config)
  }, [config])

  const exportBookmarks = useCallback(() => {
    exportBookmarksFile(config.groups)
  }, [config.groups])

  const remargeRuntime = useCallback(() => {
    setState((prev) => {
      const result = mergeWithRuntime(RUNTIME_CONFIG, prev.config, null)
      return { config: result.config, meta: result.meta, notice: true }
    })
  }, [])

  const resetToRuntime = useCallback(() => {
    clearLocal()
    setState({ config: RUNTIME_CONFIG, meta: createMeta(RUNTIME_CONFIG), notice: true })
  }, [])

  const value = useMemo<ConfigContextValue>(
    () => ({
      config,
      settings: config.settings,
      groups: config.groups,
      groupIds: Object.keys(config.groups),
      linkCount: Object.values(config.groups).reduce((total, group) => total + group.links.length, 0),
      mergeNotice: state.notice,
      storageError,
      dismissMergeNotice: () => setState((prev) => ({ ...prev, notice: false })),
      updateSettings,
      addGroup,
      renameGroup,
      moveGroup,
      setGroupOrder,
      removeGroup,
      addLink,
      updateLink,
      moveLink,
      moveLinkTo,
      removeLink,
      applyImport,
      exportConfig,
      exportBookmarks,
      remargeRuntime,
      resetToRuntime,
    }),
    [
      config,
      state.notice,
      storageError,
      updateSettings,
      addGroup,
      renameGroup,
      moveGroup,
      setGroupOrder,
      removeGroup,
      addLink,
      updateLink,
      moveLink,
      moveLinkTo,
      removeLink,
      applyImport,
      exportConfig,
      exportBookmarks,
      remargeRuntime,
      resetToRuntime,
    ],
  )

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
}
