/**
 * URL 解析的纯逻辑。
 *
 * 上游 pages/UrlParse 用 `urlConverToObject`（utils/common.ts）把 URL 实例摊成对象，
 * 字段表则在 constants 里。这里把两件事并到一处，方便脱离浏览器测试：
 * `pnpm check:tools` 会盯着协议去冒号、searchParams 展开、长度口径与非法输入。
 */

export type UrlFieldKey =
  | 'size'
  | 'protocol'
  | 'username'
  | 'password'
  | 'hostname'
  | 'port'
  | 'pathname'
  | 'hash'
  | 'searchParams'

export interface UrlField {
  key: UrlFieldKey
  description: string
}

/** 展示顺序与上游 URL_PARAMS 一致；size 排第一，但它是按解析后的完整地址算的 */
export const URL_FIELDS: UrlField[] = [
  { key: 'size', description: '长度' },
  { key: 'protocol', description: '协议' },
  { key: 'username', description: '用户名' },
  { key: 'password', description: '密码' },
  { key: 'hostname', description: '主机' },
  { key: 'port', description: '端口' },
  { key: 'pathname', description: '路径' },
  { key: 'hash', description: '哈希' },
  { key: 'searchParams', description: '搜索参数' },
]

export interface ParsedUrl {
  size: string
  protocol: string
  username: string
  password: string
  hostname: string
  port: string
  pathname: string
  hash: string
  searchParams: Record<string, string>
}

/**
 * 解析一份地址。空串与非法地址都返回 null —— 调用方靠「有没有输入」区分「还没填」和「填错了」。
 *
 * 重复的查询参数与上游一致：后出现的覆盖先出现的（`a=1&a=2` 只剩 `a: "2"`）。
 */
export function parseUrlRecord(input: string): ParsedUrl | null {
  if (input.trim() === '') return null

  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }

  const searchParams: Record<string, string> = {}
  url.searchParams.forEach((value, key) => {
    searchParams[key] = value
  })

  return {
    // 与上游 `url.toString().length` 同一个口径：先按 URL 规范归一化，再数字符
    size: `${url.toString().length} 个字符`,
    protocol: url.protocol.slice(0, -1),
    username: url.username,
    password: url.password,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    hash: url.hash,
    searchParams,
  }
}
