/**
 * 拼 className。原版 AST 树用的是 classnames 包，为这十几行再进一个依赖不值当，
 * 就照着用得到的那部分写一个：字符串、`[a, cond && 'b']`、`{ entry: true }` 三种写法都认。
 */
type ClassValue =
  | string
  | number
  | false
  | null
  | undefined
  | ClassValue[]
  | Record<string, unknown>

export function cx(...values: ClassValue[]): string {
  const out: string[] = []

  for (const value of values) {
    if (!value) continue
    if (typeof value === 'string' || typeof value === 'number') {
      out.push(String(value))
      continue
    }
    if (Array.isArray(value)) {
      const nested = cx(...value)
      if (nested) out.push(nested)
      continue
    }
    for (const key of Object.keys(value)) {
      if (value[key]) out.push(key)
    }
  }

  return out.join(' ')
}
