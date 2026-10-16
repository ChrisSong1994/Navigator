import { safeStringify } from './safeStringify.ts'

/**
 * 把一个值变成适合在树里显示的字符串。
 *
 * 原版 `case 'object'` 那支是 `JSON.stringify(value, (k, v) => stringify(v))` —— 那个 replacer 会被
 * JSON.stringify 拿根对象调一次，于是又递归回自己，任何对象进来都是栈溢出。树上对象走的是
 * Element 支路、根本到不了这里，属于没炸出来的雷；顺手换成 safeStringify。
 */
export default function stringify(value: unknown): string {
  switch (typeof value) {
    case 'function': {
      const match = value.toString().match(/function[^(]*\([^)]*\)/)
      return match ? match[0] : 'function'
    }
    case 'object':
      return value === null ? 'null' : safeStringify(value, 0)
    case 'undefined':
      return 'undefined'
    case 'number':
    case 'bigint':
      return Number.isNaN(value) ? 'NaN' : String(value)
    default:
      return JSON.stringify(value)
  }
}
