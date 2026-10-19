/**
 * 「收藏当前页」的纯逻辑：把一条链接放进某个分组、从分组里摘掉、以及反查它已经在哪些分组里。
 *
 * 放在 config/ 下而不是弹窗目录里，是因为它只依赖 NavConfig / LocalMeta 的形状：
 * 扩展弹窗（src/extension/popup）现在用它，Node 脚本也能直接跑（scripts/check-favorite.mjs）。
 * runtime 作为参数传进来而不是 import 内置配置 —— 保持纯函数，测试里好替换。
 *
 * 墓碑记账照 ConfigProvider.addLink / removeLink 的规则来，否则下次内置配置一变，
 * 刚取消收藏的那条会被 mergeWithRuntime 当成「内置新增」复活：
 *   - 新增：把该链接的墓碑清掉（可能是之前在内置配置里删过同名地址）；
 *   - 删除：只有内置配置里确实有这条时才补墓碑，内置里没有的删了就删了。
 *
 * 地址比较统一走 normalizeHref（忽略末尾斜杠与大小写）：用户不会觉得
 * https://github.com 和 https://github.com/ 是两条。写回配置时用的仍是传进来的原样地址，
 * 所以除了自己插进去的那条，别人写进去的 href 不会被改写。
 */
import { linkKey } from './merge.ts'
import type { LocalMeta } from './merge.ts'
import type { NavConfig, NavGroup, NavLink } from './schema.ts'

export interface FavoriteHit {
  groupId: string
  groupTitle: string
  /** 命中的那一条（href 是配置里的原样地址，取消收藏时按它反查） */
  link: NavLink
}

export interface FavoriteChange {
  config: NavConfig
  meta: LocalMeta
  /** 是否真的改动了配置（分组不存在、已经收藏过等情况下为 false） */
  changed: boolean
}

/** 归一化地址：去掉末尾斜杠、小写化。解析失败（相对地址、file:// 等）只做去空白与大小写 */
export function normalizeHref(href: string): string {
  const trimmed = href.trim()
  try {
    const url = new URL(trimmed)
    const path = url.pathname.replace(/\/+$/, '')
    return `${url.protocol}//${url.host}${path}${url.search}${url.hash}`.toLowerCase()
  } catch {
    return trimmed.toLowerCase()
  }
}

export function isSameHref(left: string, right: string): boolean {
  return normalizeHref(left) === normalizeHref(right)
}

/** 这个地址现在被收藏在哪些分组里（同一个地址可能在多个分组各有一条） */
export function findFavorites(groups: Record<string, NavGroup>, href: string): FavoriteHit[] {
  const hits: FavoriteHit[] = []
  for (const [groupId, group] of Object.entries(groups)) {
    for (const link of group.links) {
      if (isSameHref(link.href, href)) hits.push({ groupId, groupTitle: group.title, link })
    }
  }
  return hits
}

/** 只在这个分组里找，用来决定按钮显示「收藏」还是「取消收藏」 */
export function findFavoriteInGroup(group: NavGroup | undefined, href: string): NavLink | undefined {
  return group?.links.find((link) => isSameHref(link.href, href))
}

/** 内置配置里同一个分组下的同名地址（按归一化比较），用来补墓碑时取到它真实的 href */
function runtimeHrefInGroup(runtime: NavConfig, groupId: string, href: string): string | undefined {
  return runtime.groups[groupId]?.links.find((link) => isSameHref(link.href, href))?.href
}

/** 收藏：追加到目标分组末尾；组内已存在同一个地址就原样返回（不重复写） */
export function addFavorite(
  config: NavConfig,
  meta: LocalMeta,
  groupId: string,
  link: NavLink,
  runtime: NavConfig,
): FavoriteChange {
  const group = config.groups[groupId]
  if (!group) return { config, meta, changed: false }
  if (findFavoriteInGroup(group, link.href)) return { config, meta, changed: false }

  const href = link.href.trim()
  const text = link.text.trim() || href
  const nextLink: NavLink = { icon: link.icon.trim(), href, text }
  const runtimeHref = runtimeHrefInGroup(runtime, groupId, href)
  const cleared = new Set(runtimeHref ? [linkKey(groupId, href), linkKey(groupId, runtimeHref)] : [linkKey(groupId, href)])

  return {
    config: {
      ...config,
      groups: { ...config.groups, [groupId]: { ...group, links: [...group.links, nextLink] } },
    },
    meta: { ...meta, deletedLinks: meta.deletedLinks.filter((key) => !cleared.has(key)) },
    changed: true,
  }
}

/** 取消收藏：从这个分组里摘掉这个地址；内置配置里也有这条时补墓碑 */
export function removeFavorite(
  config: NavConfig,
  meta: LocalMeta,
  groupId: string,
  href: string,
  runtime: NavConfig,
): FavoriteChange {
  const group = config.groups[groupId]
  if (!group) return { config, meta, changed: false }

  const target = findFavoriteInGroup(group, href)
  if (!target) return { config, meta, changed: false }

  const runtimeHref = runtimeHrefInGroup(runtime, groupId, target.href)
  return {
    config: {
      ...config,
      groups: {
        ...config.groups,
        [groupId]: { ...group, links: group.links.filter((link) => link !== target) },
      },
    },
    meta: runtimeHref
      ? { ...meta, deletedLinks: [...new Set([...meta.deletedLinks, linkKey(groupId, runtimeHref)])] }
      : meta,
    changed: true,
  }
}
