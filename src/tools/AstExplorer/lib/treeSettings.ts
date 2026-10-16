/**
 * AST 树的显示选项（自动聚焦、隐藏函数/空键/位置信息/type 键）。
 *
 * 原版这些选项存在 localStorage 的 'tree_settings' 下，读档直接 `JSON.parse(storedSettings)`：
 * 手改坏了、或者浏览器里留着上个版本的结构，整个树就在 render 里抛异常白屏。
 * 这里读档一律过一遍校验，对不上就用默认值。
 *
 * 纯函数放在这个文件里，localStorage 那两句单独放着，好让 `scripts/check-tools.mjs` 直接测。
 */

/** 键跟各 adapter 的 filter.key 一一对应 */
export interface TreeSettings {
  autofocus: boolean
  hideFunctions: boolean
  hideEmptyKeys: boolean
  hideLocationData: boolean
  hideTypeKeys: boolean
  /** 树 adapter 是照着这个对象读开关的，键得能按字符串取 */
  [key: string]: boolean
}

/** 原版是 'tree_settings'，这里加前缀以免跟同域下别的应用撞车 */
export const TREE_SETTINGS_KEY = 'navigator.ast.treeSettings'

export const DEFAULT_TREE_SETTINGS: TreeSettings = {
  autofocus: true,
  hideFunctions: true,
  hideEmptyKeys: false,
  hideLocationData: false,
  hideTypeKeys: false,
}

const SETTING_KEYS = Object.keys(DEFAULT_TREE_SETTINGS)

/**
 * 读档：不是对象、字段不是布尔、字段缺失，一律退回默认值。
 * 只认已知的键，多出来的忽略（filter 的键都是我们自己定的，用户存不进新键）。
 */
export function parseTreeSettings(raw: string | null | undefined): TreeSettings {
  if (!raw) return { ...DEFAULT_TREE_SETTINGS }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_TREE_SETTINGS }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...DEFAULT_TREE_SETTINGS }
  }

  const source = parsed as Record<string, unknown>
  const settings = { ...DEFAULT_TREE_SETTINGS }
  for (const key of SETTING_KEYS) {
    if (typeof source[key] === 'boolean') {
      settings[key] = source[key]
    }
  }
  return settings
}

export function readTreeSettings(): TreeSettings {
  try {
    return parseTreeSettings(localStorage.getItem(TREE_SETTINGS_KEY))
  } catch {
    // 隐私模式之类拿不到 localStorage，用默认值就好
    return { ...DEFAULT_TREE_SETTINGS }
  }
}

export function writeTreeSettings(settings: TreeSettings): void {
  try {
    localStorage.setItem(TREE_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // 写不进去（配额满 / 被禁）也不该把工具带进沟里
  }
}
