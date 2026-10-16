/**
 * 工具通用的小工具函数。
 *
 * 原项目这些来自 @fett/utils / lodash / dayjs，这里就地实现，省掉三个依赖。
 */

/** 空值判定：null / undefined / 空串 / 纯空白都算空（原项目用的 @fett/utils isEmpty） */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  return typeof value === 'string' && value.trim() === ''
}

/**
 * 尾部防抖。monaco 每敲一个键都会 onChange，不压一下会拿每一下击键去跑一次解析。
 * 订阅者能在卸载时 cancel，免得组件没了还 setState。
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = (...args: A) => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      fn(...args)
    }, wait)
  }
  run.cancel = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  return run
}

/** 历史记录里的时间：跟原项目 dayjs().format('YYYY-MM-DD HH:mm') 一个口径，本地时区 */
export function formatTime(time: number): string {
  const date = new Date(time)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
