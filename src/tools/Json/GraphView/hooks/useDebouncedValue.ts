import { useEffect, useState } from 'react'

/** 值稳定 wait 毫秒后才放出去（原项目用的 @mantine/hooks useDebouncedValue，这里就地实现） */
export function useDebouncedValue<T>(value: T, wait: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), wait)
    return () => clearTimeout(timer)
  }, [value, wait])

  return debounced
}
