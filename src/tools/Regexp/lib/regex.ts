/**
 * 正则测试的纯逻辑。上游是 utils/regMatch.ts（依赖 lodash），这里重写，行为和它**有意不同**：
 *
 * 上游拿 `matchedValue.indexOf(groupValue)` 去猜分组在匹配值里的位置，遇到重复值就
 * `calculateGroupValue.index++`（只改了对象上的副本，根本没影响下一次 indexOf 的起点），
 * lookbehind、同名内容、未参与匹配的分组全算不对。
 *
 * 这里改用 `d`（hasIndices）修饰符：它不改变匹配语义，只让每处匹配多带一份 `indices`，
 * 每个分组落在原文里的 `[start, end)` 由引擎直接给出。用户可选修饰符仍然只有 g / i / m（与上游一致），
 * `d` 由本模块内部追加，界面上不出现。
 *
 * 分组下标之外的另一个坑是零宽匹配：`^`、`\b`、`(?=…)` 会匹配出长度为 0 的一段，
 * 高亮时得画成一条竖线而不是一个空的 <mark>（见 index.tsx 的渲染）。
 */

/** 界面上允许用户勾选的修饰符，与上游一致；`d` 是内部追加的，不在其中 */
export const USER_FLAGS = ['g', 'i', 'm'] as const

export type UserFlag = (typeof USER_FLAGS)[number]

export function isUserFlag(value: string): value is UserFlag {
  return (USER_FLAGS as readonly string[]).includes(value)
}

/** 从「一串修饰符」里筛出界面认识的那几个，顺序照 USER_FLAGS（弹窗同步、历史回填都走它） */
export function pickUserFlags(flags: readonly string[]): UserFlag[] {
  return USER_FLAGS.filter((flag) => flags.includes(flag))
}

/** 一次最多列多少处匹配：再多的明细表也没人翻，还会把渲染拖垮 */
export const MAX_MATCHES = 5000

/** 高亮区最多渲染多少处：明细表可以多，DOM 节点不行 */
export const MAX_HIGHLIGHT = 2000

export interface RegexpMatchGroup {
  /** 展示用的分组序号（1 起）；命名分组另外带上名字 */
  key: number
  name?: string
  /** 分组在原文里的区间。未参与匹配的分组没有区间，值为 undefined */
  index: number | null
  length: number
  value: string | undefined
}

export interface RegexpMatch {
  /** 第几处匹配（1 起），同时也是 React key 与明细表的 rowKey */
  key: number
  /** 整段匹配在原文里的起止 `[index, index + length)` */
  index: number
  length: number
  value: string
  groups: RegexpMatchGroup[]
}

/** 用户勾的修饰符拼成字符串；顺序固定，界面上的 `/{flag}` 才不会忽左忽右 */
export function joinFlags(flags: readonly string[]): string {
  return pickUserFlags(flags).join('')
}

/**
 * 造一个带 `d` 的正则。非法 pattern 由 `new RegExp` 自己抛（上游也是把错误消息直接显示出来，
 * 这里沿用：SyntaxError 的 message 对写正则的人来说是能照着改的）。
 *
 * 修饰符只取界面上认识的那几个（g / i / m），再补 `d`。上游同样只暴露这三个；
 * 其它修饰符（s / u / y）在图里没有入口，混进来会让「勾选框」与实际行为对不上。
 */
export function buildRegexp(pattern: string, flags: readonly string[]): RegExp {
  return new RegExp(pattern, `${joinFlags(flags)}d`)
}

/**
 * 从 pattern 源码里数出「第几个捕获分组叫什么名字」。
 *
 * 为什么不用 `indices.groups` 反推：那里只有**参与了匹配**的命名分组，没参与的分组是 undefined，
 * 而且它给的是区间不是序号，同区间的两个分组只能猜。数源码是确定的：
 * 跳过转义与字符类，`(` 后跟 `?` 的是非捕获（`?:` / `?=` / `?!` / `?<=` / `?<!`），
 * `(?<name>` 是命名捕获，其余 `(` 依次编号。pattern 非法的话 RegExp 早就抛了，这里拿到的一定是合法的。
 */
export function namedGroupsOf(pattern: string): Map<number, string> {
  const names = new Map<number, string>()
  let position = 0
  let escaped = false
  let inClass = false

  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (inClass) {
      if (char === ']') inClass = false
      continue
    }
    if (char === '[') {
      inClass = true
      continue
    }
    if (char !== '(') continue

    position += 1
    if (pattern[i + 1] !== '?') continue
    if (pattern[i + 2] !== '<') continue
    // `(?<=` / `(?<!` 是环视，不是命名分组
    const next = pattern[i + 3]
    if (next === '=' || next === '!') continue
    const close = pattern.indexOf('>', i + 3)
    if (close > i + 3) names.set(position, pattern.slice(i + 3, close))
  }
  return names
}

/**
 * 一次匹配都没参与的分组也要列出来（上游直接过滤掉了），否则 `(a)|(b)` 只写 `a` 时，
 * 用户会以为第二个分组不存在。
 *
 * 区间来自 `indices`（`d` 修饰符），未参与匹配的分组区间为 null、值为 undefined ——
 * 这跟「参与了但匹配到空串」（区间是 `[n, n)`、值为 ''）是两回事，界面上要分开说。
 */
function groupsOf(match: RegExpExecArray, pattern: string): RegexpMatchGroup[] {
  const indices = match.indices
  const named = namedGroupsOf(pattern)

  const groups: RegexpMatchGroup[] = []
  for (let position = 1; position < match.length; position += 1) {
    const range = indices?.[position] ?? null
    const value = match[position]
    const group: RegexpMatchGroup = {
      key: position,
      index: range ? range[0] : null,
      length: range ? range[1] - range[0] : 0,
      value,
    }
    // value 为 undefined 才是「这一组没参与」，空串是「参与了但是空的」，两者要分开
    const name = named.get(position)
    if (name) group.name = name
    groups.push(group)
  }
  return groups
}

/**
 * 找出所有匹配。全局：`matchAll`（自己的 lastIndex 不会污染调用方的正则，零宽匹配也不会原地打转）；
 * 非全局：`exec` 一次，与 `String.prototype.match` 口径一致。
 *
 * 超出 MAX_MATCHES 就截断 — 但要先数到上限为止，不能把整份文本全扫完。truncated 给调用方
 * 在界面上说明「只列了前 N 处」。
 */
export function findMatches(
  regexp: RegExp,
  text: string,
  limit = MAX_MATCHES,
): { matches: RegexpMatch[]; truncated: boolean } {
  const matches: RegexpMatch[] = []
  const pull = (match: RegExpExecArray): void => {
    matches.push({
      key: matches.length + 1,
      index: match.index,
      length: match[0].length,
      value: match[0],
      groups: groupsOf(match, regexp.source),
    })
  }

  if (!regexp.global) {
    const match = regexp.exec(text)
    if (match) pull(match)
    return { matches, truncated: false }
  }

  // 用一份克隆跑，免得改到调用方那个正则的 lastIndex（buildRegexp 每次都是新的，这样更稳妥）
  const scanner = new RegExp(regexp.source, regexp.flags)
  for (const match of text.matchAll(scanner)) {
    pull(match)
    if (matches.length >= limit) return { matches, truncated: true }
  }
  return { matches, truncated: false }
}

/**
 * 替换。`$&` / `$1` / `$<name>` 全交给原生 String.replace，行为与上游一致。
 *
 * 全局 / 非全局的差异也交给原生：非全局只换第一处。零宽匹配下原生不会卡死（引擎自己会前进）。
 */
export function replaceText(regexp: RegExp, text: string, replacement: string): string {
  return text.replace(regexp, replacement)
}