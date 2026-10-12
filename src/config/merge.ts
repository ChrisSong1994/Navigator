/**
 * 内置配置（src/global_runtime.json）与本地配置（localStorage）的合并规则。
 *
 * 纯函数，无浏览器 API —— scripts/check-merge.mjs 用同一份逻辑做冒烟测试。
 *
 * 规则一句话：**本地权重最高，内置配置只做增量补充**。
 *   1. 本地还没有配置 → 直接用内置配置初始化；
 *   2. 内置配置没变（hash 一致）→ 本地原样使用；
 *   3. 内置配置变了：
 *      - settings 逐项比较：本地改过的（与上次合并时的内置值不同）保留本地值，没动过的跟随内置配置；
 *      - groups 以本地为骨架：本地已有的分组保留本地的标题与链接顺序，
 *        内置配置里新增的分组 / 新增的链接会被并入（追加到末尾）；
 *      - 本地删掉的分组 / 链接记在 meta 的墓碑里，不会被内置配置"复活"。
 */
import { parseConfig, serializeConfig } from './schema.ts'
import type { NavConfig, NavGroup, NavLink, NavSettings } from './schema.ts'

export interface LocalMeta {
  /** 上次合并时内置配置的 hash，用来判断内置配置有没有变 */
  runtimeHash: string
  /** 上次合并时内置配置的 settings，用来判断某一项用户有没有改过 */
  baseSettings: NavSettings | null
  /** 本地删除过的分组 id */
  deletedGroups: string[]
  /** 本地删除过的链接，形如 `分组id::href` */
  deletedLinks: string[]
  updatedAt: number
}

export interface MergeResult {
  config: NavConfig
  meta: LocalMeta
  /** 是否发生了合并（内置配置有变化） */
  merged: boolean
}

export function createMeta(runtime: NavConfig): LocalMeta {
  return {
    runtimeHash: hashConfig(runtime),
    baseSettings: { ...runtime.settings },
    deletedGroups: [],
    deletedLinks: [],
    updatedAt: Date.now(),
  }
}

export function linkKey(groupId: string, href: string): string {
  return `${groupId}::${href}`
}

/** 稳定序列化后的 FNV-1a 短 hash，只用于判断配置有没有变 */
export function hashConfig(config: NavConfig): string {
  const text = serializeConfig(config, 0)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function mergeSettings(runtime: NavSettings, local: NavSettings, base: NavSettings | null): NavSettings {
  const pick = <K extends keyof NavSettings>(key: K): NavSettings[K] => {
    const localValue = local[key]
    // 本地留空视为"使用内置配置"
    if (localValue === undefined || localValue === '') return runtime[key]
    // 与上次合并时的内置值相同 → 用户没改过，跟随内置配置；否则保留本地值
    return base !== null && localValue === base[key] ? runtime[key] : localValue
  }
  return {
    siteTitle: pick('siteTitle'),
    siteLogo: pick('siteLogo'),
    primaryColor: pick('primaryColor'),
    linkFontSize: pick('linkFontSize'),
    linkCardGap: pick('linkCardGap'),
    themeMode: pick('themeMode'),
    viewMode: pick('viewMode'),
    searchEngine: pick('searchEngine'),
    searchOpenInNewTab: pick('searchOpenInNewTab'),
    linkOpenInNewTab: pick('linkOpenInNewTab'),
  }
}

function mergeLinks(runtimeLinks: NavLink[], localLinks: NavLink[], deleted: Set<string>, groupId: string): NavLink[] {
  const merged = localLinks.filter((link) => !deleted.has(linkKey(groupId, link.href)))
  const known = new Set(merged.map((link) => link.href))
  for (const link of runtimeLinks) {
    const key = linkKey(groupId, link.href)
    if (known.has(link.href) || deleted.has(key)) continue
    merged.push(link) // 内置配置里新增的链接追加到末尾
    known.add(link.href)
  }
  return merged
}

function mergeGroup(id: string, runtimeGroup: NavGroup, localGroup: NavGroup, meta: LocalMeta): NavGroup {
  const deleted = new Set(meta.deletedLinks)
  return {
    title: localGroup.title || runtimeGroup.title,
    links: mergeLinks(runtimeGroup.links, localGroup.links, deleted, id),
  }
}

export function mergeWithRuntime(runtime: NavConfig, local: NavConfig | null, meta: LocalMeta | null): MergeResult {
  if (!local) {
    return { config: normalize(runtime) ?? runtime, meta: createMeta(runtime), merged: true }
  }

  const runtimeHash = hashConfig(runtime)
  if (meta && meta.runtimeHash === runtimeHash) {
    // 内置配置没变，本地就是唯一真相
    return { config: normalize(local) ?? local, meta: { ...meta, updatedAt: Date.now() }, merged: false }
  }

  const effectiveMeta = meta ?? createMeta(runtime)
  const deletedGroups = new Set(effectiveMeta.deletedGroups)
  const groups: Record<string, NavGroup> = {}

  for (const [id, runtimeGroup] of Object.entries(runtime.groups)) {
    if (deletedGroups.has(id)) continue
    const localGroup = local.groups[id]
    groups[id] = localGroup ? mergeGroup(id, runtimeGroup, localGroup, effectiveMeta) : runtimeGroup
  }
  for (const [id, localGroup] of Object.entries(local.groups)) {
    if (groups[id] || deletedGroups.has(id)) continue
    groups[id] = localGroup // 本地自建的分组保留
  }

  const config: NavConfig = {
    settings: mergeSettings(runtime.settings, local.settings, meta?.baseSettings ?? null),
    groups,
  }
  const normalized = normalize(config) ?? config
  return {
    config: normalized,
    meta: {
      runtimeHash,
      baseSettings: { ...runtime.settings },
      deletedGroups: [...deletedGroups],
      deletedLinks: [...new Set(effectiveMeta.deletedLinks)],
      updatedAt: Date.now(),
    },
    merged: true,
  }
}

/** 用同一套校验逻辑收口，保证交给页面的配置永远合法 */
export function normalize(config: NavConfig): NavConfig | null {
  return parseConfig(config).config
}

// ---------------------------------------------------------------- 上传文件的合并

/**
 * 「全部替换」之后要写回的删除记录：内置配置里有、但替换内容里已经没有了的分组与链接。
 *
 * 「全部替换成新的」意味着当前这份就是全部 —— 不记墓碑的话，内置配置一变，
 * mergeWithRuntime 会把用户刚替换掉的内容又当「新增」并回来。想拿回内置内容有专门的
 * 「重新合并内置配置」按钮（那条路径传 meta: null，不受墓碑影响）。
 * 反过来，替换内容里有的部分不记墓碑，所以将来内置配置的更新仍能正常并入。
 */
export function replacementTombstones(
  runtime: NavConfig,
  groups: Record<string, NavGroup>,
): { deletedGroups: string[]; deletedLinks: string[] } {
  const keptLinks = new Set(
    Object.entries(groups).flatMap(([id, group]) => group.links.map((link) => linkKey(id, link.href))),
  )
  const deletedGroups: string[] = []
  const deletedLinks: string[] = []
  for (const [id, group] of Object.entries(runtime.groups)) {
    if (!Object.hasOwn(groups, id)) deletedGroups.push(id)
    for (const link of group.links) {
      const key = linkKey(id, link.href)
      if (!keptLinks.has(key)) deletedLinks.push(key)
    }
  }
  return { deletedGroups, deletedLinks }
}

export interface ImportMergeResult {
  groups: Record<string, NavGroup>
  /** 本次真正新增的分组 id（匹配到现有分组的那些不算），用于预览计数 */
  addedGroupIds: string[]
  /** 本次真正追加到现有分组里的链接，用于预览计数 */
  addedLinks: { groupId: string; href: string }[]
  /** 因为目标分组里已经有同 href 而跳过的条数 */
  skippedLinks: number
  /**
   * 本次导入「提到」的全部分组 id（新建的 + 并入的）与链接（含被跳过的重复项），
   * 形如 `分组id::href`。用来解除对应的删除记录 —— 不清的话刚导进来的内容会在
   * 下次内置配置变动时被 mergeWithRuntime 当成「本地删过的」丢掉。
   */
  touchedGroupIds: string[]
  touchedLinkKeys: string[]
}

/**
 * 把上传文件里的分组并进当前分组（「合并」方式）。
 *
 * 逐组定位归属：先按 id 精确匹配（同一个文件夹重新导出再导入 → 落回原分组，改过名也认），
 * 再按标题精确匹配（用户手工建过同名分组 → 并进去），都匹配不上才作为新分组追加到末尾。
 * 命中已有分组时，只把 href 不重复的链接追加到末尾，现有链接的位置 / 顺序 / 改过的标题全部保留。
 */
export function mergeImported(current: Record<string, NavGroup>, incoming: Record<string, NavGroup>): ImportMergeResult {
  const groups: Record<string, NavGroup> = {}
  for (const [id, group] of Object.entries(current)) {
    groups[id] = { title: group.title, links: [...group.links] }
  }

  const idByTitle = new Map<string, string>()
  for (const [id, group] of Object.entries(groups)) {
    if (!idByTitle.has(group.title)) idByTitle.set(group.title, id)
  }

  const addedGroupIds: string[] = []
  const addedLinks: { groupId: string; href: string }[] = []
  const touchedGroupIds: string[] = []
  const touchedLinkKeys = new Set<string>()
  let skippedLinks = 0

  for (const [incomingId, incomingGroup] of Object.entries(incoming)) {
    // 用 hasOwn 而不是取值判断：id 恰好是 constructor / toString 这类名字时，取值会拿到原型上的属性
    const targetId = Object.hasOwn(groups, incomingId) ? incomingId : idByTitle.get(incomingGroup.title)
    const isNew = targetId === undefined
    // 全新分组：追加到末尾（incomingId 此刻一定没被占用，上面已按 id 匹配过）
    const resolvedId = isNew ? incomingId : targetId

    if (isNew) {
      groups[resolvedId] = { title: incomingGroup.title, links: [] }
      idByTitle.set(incomingGroup.title, resolvedId)
      addedGroupIds.push(resolvedId)
    }
    touchedGroupIds.push(resolvedId)

    const target = groups[resolvedId]
    const known = new Set(target.links.map((link) => link.href))
    for (const link of incomingGroup.links) {
      // 组内按 href 去重：链接的编辑 / 删除 / 排序都是按 href 定位的，重复条目会连坐
      touchedLinkKeys.add(linkKey(resolvedId, link.href))
      if (known.has(link.href)) {
        skippedLinks += 1
        continue
      }
      known.add(link.href)
      target.links.push(link)
      addedLinks.push({ groupId: resolvedId, href: link.href })
    }
  }

  return { groups, addedGroupIds, addedLinks, skippedLinks, touchedGroupIds, touchedLinkKeys: [...touchedLinkKeys] }
}
