/**
 * 能应付循环引用的 JSON.stringify。
 *
 * 原版是「见过的对象全扔进一个 Set，再遇到就写 [Circular]」—— 那会把**共享**引用也误判成环：
 * babel 的注释对象会被多个节点引用、yaml 的锚点也是同一个节点多处在用，
 * 这些在 JSON 面板里本该正常展开，原版却都变成了 "[Circular]"。
 *
 * 这里改成只把「当前这条祖先链」当环：进出各记一次，兄弟之间共用的对象照常完整序列化。
 */
function sanitize(value: unknown, ancestors: Set<object>): unknown {
  if (!value || typeof value !== 'object') {
    return value
  }
  if (ancestors.has(value)) {
    return '[Circular]'
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return value.map((item) => sanitize(item, ancestors))
    }
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      out[key] = sanitize((value as Record<string, unknown>)[key], ancestors)
    }
    return out
  } finally {
    ancestors.delete(value)
  }
}

export function safeStringify(value: unknown, space: number = 2): string {
  return JSON.stringify(sanitize(value, new Set()), null, space)
}
