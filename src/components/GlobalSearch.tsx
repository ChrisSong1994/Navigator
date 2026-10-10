import { SearchOutlined } from '@ant-design/icons'
import { Button, Dropdown, Input } from 'antd'
import type { InputRef } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfig } from '../config/configContext.ts'
import { getSearchEngineAssets } from '../search/engineAssets.ts'
import { buildNavigationUrl, getSearchEngine, SEARCH_ENGINE_OPTIONS } from '../search/engines.ts'
import { fetchSearchSuggestions } from '../search/suggestions.ts'
import type { SearchSuggestion } from '../search/suggestions.ts'
import type { SearchEngine } from '../config/schema.ts'

const SUGGEST_DEBOUNCE_MS = 180

function EngineIcon({ engine, className }: { engine: SearchEngine; className?: string }) {
  const assets = getSearchEngineAssets(engine)
  return <img src={assets.icon} alt="" aria-hidden="true" className={className} />
}

function openSearch(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** 新标签页主搜索框：Enter 搜索 / 打开网址，方向键选择联想词。 */
export function GlobalSearch() {
  const { settings, updateSettings } = useConfig()
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<InputRef>(null)
  const requestRef = useRef(0)

  const engine = getSearchEngine(settings.searchEngine)
  const engineOptions = useMemo(
    () =>
      SEARCH_ENGINE_OPTIONS.map((item) => ({
        key: item.key,
        label: (
          <span className="flex items-center gap-2">
            <EngineIcon engine={item.key as SearchEngine} className="h-4 w-4 object-contain" />
            {item.label}
          </span>
        ),
      })),
    [],
  )

  const submit = useCallback(
    (text?: string) => {
      const keyword = (text ?? value).trim()
      if (!keyword) return
      openSearch(buildNavigationUrl(settings.searchEngine, keyword))
      setOpen(false)
      setSuggestions([])
      setActiveIndex(-1)
    },
    [settings.searchEngine, value],
  )

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true
      const commandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      const slash = event.key === '/' && !typing
      if (!commandK && !slash) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    document.addEventListener('keydown', onShortcut)
    return () => document.removeEventListener('keydown', onShortcut)
  }, [])

  useEffect(() => {
    const keyword = value.trim()
    const request = ++requestRef.current
    if (!keyword) return

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void fetchSearchSuggestions(settings.searchEngine, keyword, controller.signal)
        .then((items) => {
          if (request !== requestRef.current || controller.signal.aborted) return
          setSuggestions(items)
          setOpen(items.length > 0)
          setActiveIndex(items.length > 0 ? 0 : -1)
        })
        .catch(() => {
          if (request !== requestRef.current) return
          setSuggestions([])
        })
    }, SUGGEST_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [settings.searchEngine, value])

  const visibleSuggestions = value.trim() ? suggestions : []

  const menu = visibleSuggestions.length
    ? {
        items: visibleSuggestions.map((item, index) => ({
          key: String(index),
          label: (
            <span className={index === activeIndex ? 'font-medium text-[var(--spirit-accent)]' : undefined}>
              {item.keyword}
            </span>
          ),
        })),
        onClick: ({ key }: { key: string }) => submit(visibleSuggestions[Number(key)]?.keyword),
      }
    : undefined

  return (
    <div className="relative mx-auto w-full max-w-[680px]">
      <img
        src={getSearchEngineAssets(settings.searchEngine).logo}
        alt={engine.label}
        className="mx-auto mb-4 h-[58px] max-w-[230px] object-contain"
      />
      <Dropdown
        open={open && visibleSuggestions.length > 0}
        menu={menu}
        trigger={[]}
        placement="bottom"
        styles={{ root: { width: '100%' } }}
      >
        <div className="flex rounded-xl border border-[var(--spirit-border)] bg-[var(--spirit-surface)] p-1.5 shadow-[var(--spirit-shadow)] transition-colors focus-within:border-[var(--spirit-accent)] items-center">
          <Dropdown
            trigger={['click']}
            menu={{
              items: engineOptions,
              selectable: true,
              selectedKeys: [settings.searchEngine],
              onClick: ({ key }) => updateSettings({ searchEngine: key as typeof settings.searchEngine }),
            }}
          >
            <Button
              type="text"
              className="shrink-0 font-medium"
              icon={<EngineIcon engine={settings.searchEngine} className="h-[18px] w-[18px] object-contain" />}
            >
              {engine.label}
            </Button>
          </Dropdown>
          <Input
            ref={inputRef}
            variant="borderless"
            size="large"
            value={value}
            autoComplete="off"
            placeholder="搜索内容，或输入网址"
            aria-label="搜索内容或网址"
            className="min-w-0 flex-1 [&_.ant-input]:!bg-transparent [&_.ant-input]:!outline-none [&.ant-input-borderless:focus-visible]:!outline-none [&.ant-input-borderless:has(input:focus-visible)]:!outline-none"
            onChange={(event) => setValue(event.target.value)}
            onFocus={() => visibleSuggestions.length > 0 && setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && visibleSuggestions.length > 0) {
                event.preventDefault()
                setOpen(true)
                setActiveIndex((index) => (index + 1) % visibleSuggestions.length)
              } else if (event.key === 'ArrowUp' && visibleSuggestions.length > 0) {
                event.preventDefault()
                setOpen(true)
                setActiveIndex((index) => (index - 1 + visibleSuggestions.length) % visibleSuggestions.length)
              } else if (event.key === 'Enter') {
                event.preventDefault()
                submit(activeIndex >= 0 ? visibleSuggestions[activeIndex]?.keyword : value)
              } else if (event.key === 'Escape') {
                setOpen(false)
              }
            }}
          />
          <Button type="primary" size="large" icon={<SearchOutlined />} aria-label="搜索" onClick={() => submit()} />
        </div>
      </Dropdown>
    </div>
  )
}
