/**
 * 新建分组的规则。
 *
 * 页面配置面板的「新增分组」和扩展弹窗的「新建分组并收藏」都得产出同一种 id（`group-N`），
 * 否则两边各建一个、同步到一起时会被当成两个分组。id 约定与墓碑清理放在这里，两边都调它。
 */
import type { LocalMeta } from './merge.ts'
import type { NavConfig, NavGroup } from './schema.ts'

/** 分组 id 序号：取当前没被占用的第一个 */
export function nextGroupIndex(groups: Record<string, NavGroup>): number {
  let index = Object.keys(groups).length + 1
  while (groups[`group-${index}`]) index += 1
  return index
}

export interface CreatedGroup {
  config: NavConfig
  meta: LocalMeta
  id: string
}

/**
 * 新建一个空分组，追加到末尾。
 * 顺手清掉同 id 的墓碑：之前在内置配置里删过这个 id 的话，不清就会在下次合并时又被拦掉。
 */
export function createGroup(config: NavConfig, meta: LocalMeta, title?: string): CreatedGroup {
  const index = nextGroupIndex(config.groups)
  const id = `group-${index}`
  const groupTitle = title?.trim() || `新分组 ${index}`
  return {
    config: { ...config, groups: { ...config.groups, [id]: { title: groupTitle, links: [] } } },
    meta: { ...meta, deletedGroups: meta.deletedGroups.filter((deleted) => deleted !== id) },
    id,
  }
}
