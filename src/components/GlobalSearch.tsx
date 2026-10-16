import { SearchOutlined } from '@ant-design/icons'
import { Button, Dropdown, Input } from 'antd'
import type { InputRef, MenuProps } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfig } from '../config/configContext.ts'
import type { NavLink, SearchEngine } from '../config/schema.ts'
import { getSearchEngineAssets } from '../search/engineAssets.ts'
import { buildNavigationUrl, getSearchEngine, SEARCH_ENGINE_OPTIONS } from '../search/engines.ts'
import { fetchSearchSuggestions } from '../search/suggestions.ts'
import type { SearchSuggestion } from '../search/suggestions.ts'
import { LinkIcon } from './LinkIcon.tsx'

const SUGGEST_DEBOUNCE_MS = 180
/** 下拉里最多列出的快捷链接条数，多出来的只提示总数，免得把上面的联想词挤没 */
const LINK_MATCH_LIMIT = 6
/** 聚焦快捷键的文案：Mac 上写 ⌘K，其他平台写 Ctrl+K（两种组合键运行时都认） */
const FOCUS_SHORTCUT = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? '⌘K' : 'Ctrl+K'
/** 输入框为空时显示的提示；placeholder 只能是字符串，所以快捷键就写进文案里 */
const SEARCH_PLACEHOLDER = `搜索内容，或输入网址 · / 或 ${FOCUS_SHORTCUT} 聚焦`

/** 下拉里的快捷链接：命中的链接本身 + 它所在的分组名 */
interface LinkMatch {
  kind: 'link'
  groupTitle: string
  link: NavLink
}

/** 下拉列表里的一项：搜索引擎联想词，或命中的本地快捷链接 */
type DropdownEntry = { kind: 'suggest'; keyword: string } | LinkMatch

function EngineIcon({ engine, className }: { engine: SearchEngine; className?: string }) {
  const assets = getSearchEngineAssets(engine)
  return <img src={assets.icon} alt="" aria-hidden="true" className={className} />
}

function openUrl(url: string, openInNewTab: boolean) {
  if (openInNewTab) {
    window.open(url, '_blank', 'noopener,noreferrer')
  } else {
    window.location.assign(url)
  }
}

/** 新标签页主搜索框：Enter 搜索 / 打开网址，方向键在联想词与快捷链接之间选择。 */
export function GlobalSearch() {
  const { settings, groups, groupIds, updateSettings } = useConfig()
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [open, setOpen] = useState(false)
  /** 高亮项；与下面算出的 listKey 绑在一起，列表一变就自动回到第一项 */
  const [active, setActive] = useState<{ key: string; index: number }>({ key: '', index: -1 })
  const [searchWidth, setSearchWidth] = useState<number | null>(null)
  const inputRef = useRef<InputRef>(null)
  const searchBoxRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef(0)
  const composingRef = useRef(false)

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

  /** 按分组顺序扫一遍全部链接，链接名或地址包含关键词即算命中；只留前 LINK_MATCH_LIMIT 条 */
  const linkMatches = useMemo(() => {
    const query = value.trim().toLowerCase()
    const items: LinkMatch[] = []
    let total = 0
    if (query) {
      for (const groupId of groupIds) {
        const group = groups[groupId]
        if (!group) continue
        for (const link of group.links) {
          if (!`${link.text} ${link.href}`.toLowerCase().includes(query)) continue
          total += 1
          if (items.length < LINK_MATCH_LIMIT) items.push({ kind: 'link', groupTitle: group.title, link })
        }
      }
    }
    return { items, total }
  }, [groupIds, groups, value])

  // 输入清空后旧的联想词不能再留在下拉里
  const visibleSuggestions = useMemo(() => (value.trim() ? suggestions : []), [suggestions, value])

  /** 联想词在前、快捷链接在后；方向键与 Enter 都在这个合并列表上走 */
  const entries = useMemo<DropdownEntry[]>(
    () => [
      ...visibleSuggestions.map((item): DropdownEntry => ({ kind: 'suggest', keyword: item.keyword })),
      ...linkMatches.items,
    ],
    [linkMatches, visibleSuggestions],
  )

  // 命中列表跟着输入实时变：高亮项只在列表没变时保留，变了就回到第一项
  const listKey = `${entries.length}:${value}`
  const activeIndex = active.key === listKey ? active.index : entries.length > 0 ? 0 : -1
  const dropdownOpen = open && entries.length > 0

  /** 方向键上下移动高亮项 */
  const moveActive = useCallback(
    (offset: number) => {
      if (entries.length === 0) return
      setActive({ key: listKey, index: (activeIndex + offset + entries.length) % entries.length })
    },
    [activeIndex, entries.length, listKey],
  )

  const close = useCallback(() => setOpen(false), [])

  const submit = useCallback(
    (text?: string) => {
      const keyword = (text ?? value).trim()
      if (!keyword) return
      openUrl(buildNavigationUrl(settings.searchEngine, keyword), settings.searchOpenInNewTab)
      close()
    },
    [close, settings.searchEngine, settings.searchOpenInNewTab, value],
  )

  const activate = useCallback(
    (entry: DropdownEntry | undefined) => {
      if (!entry) return
      if (entry.kind === 'link') {
        openUrl(entry.link.href, settings.linkOpenInNewTab)
        close()
      } else {
        submit(entry.keyword)
      }
    },
    [close, settings.linkOpenInNewTab, submit],
  )

  useEffect(() => {
    const element = searchBoxRef.current
    if (!element) return
    const updateWidth = () => setSearchWidth(element.getBoundingClientRect().width)
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  /**
   * 进入页面光标就落在搜索框里。
   * 新标签页里焦点先归浏览器地址栏，而页面没法从浏览器 UI 手里把焦点抢回来——这时挂载期这次 focus()
   * 只是把 activeElement 记成了输入框，真正生效要等页面拿到焦点。所以再补一次：页面第一次真正
   * 拿到焦点时（按 Tab 进页面 / 点一下页面）落一次，之后就还回给用户，不再抢。
   *
   * preventScroll：焦点落在顶部输入框时浏览器会顺手把页面滚回可见位置。从工具页返回首页会重新挂载
   * 这个组件，那就把刚恢复的滚动位置又拱回顶部了——这里只要焦点，不要滚动。
   */
  useEffect(() => {
    const focusInput = () => inputRef.current?.focus({ preventScroll: true })
    focusInput()
    if (document.hasFocus()) return

    let timer = 0
    const onPageFocus = () => {
      window.removeEventListener('focus', onPageFocus)
      window.clearTimeout(timer)
      // 让浏览器先把它自己那次默认聚焦处理完再落地，免得被盖掉
      timer = window.setTimeout(focusInput, 0)
    }
    window.addEventListener('focus', onPageFocus)
    return () => {
      window.removeEventListener('focus', onPageFocus)
      window.clearTimeout(timer)
    }
  }, [])

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

  const overflowCount = linkMatches.total - linkMatches.items.length

  const renderEntryLabel = (entry: DropdownEntry, index: number) => {
    const highlighted = index === activeIndex
    const rowClass = `flex min-w-0 items-center gap-2 ${highlighted ? 'font-medium text-[var(--spirit-accent)]' : ''}`
    if (entry.kind === 'suggest') {
      return (
        <span className={rowClass}>
          <SearchOutlined
            aria-hidden="true"
            className={`shrink-0 text-[13px] ${highlighted ? 'text-[var(--spirit-accent)]' : 'text-[var(--spirit-muted)]'}`}
          />
          <span className="truncate">{entry.keyword}</span>
        </span>
      )
    }
    return (
      <span className={rowClass}>
        <LinkIcon link={entry.link} size={16} />
        <span className="truncate">{entry.link.text}</span>
        <span className="ml-auto shrink-0 pl-2 text-[11px] text-[var(--spirit-muted)]">{entry.groupTitle}</span>
      </span>
    )
  }

  const menuItems: MenuProps['items'] = [
    ...visibleSuggestions.map((item, index) => ({
      key: String(index),
      label: renderEntryLabel({ kind: 'suggest', keyword: item.keyword }, index),
    })),
    ...(linkMatches.items.length
      ? [
          {
            type: 'group' as const,
            key: 'quick-links',
            label: <span className="text-[11px] font-medium text-[var(--spirit-muted)]">快捷链接</span>,
            children: [
              ...linkMatches.items.map((entry, offset) => {
                const index = visibleSuggestions.length + offset
                return { key: String(index), label: renderEntryLabel(entry, index) }
              }),
              ...(overflowCount > 0
                ? [
                    {
                      key: 'quick-links-overflow',
                      disabled: true,
                      label: (
                        <span className="text-[11px] text-[var(--spirit-muted)]">还有 {overflowCount} 条匹配链接</span>
                      ),
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
  ]

  const menu = dropdownOpen
    ? { items: menuItems, onClick: ({ key }: { key: string }) => activate(entries[Number(key)]) }
    : undefined

  return (
    <div className="relative mx-auto w-full max-w-[680px]">
      <img
        src={getSearchEngineAssets(settings.searchEngine).logo}
        alt={engine.label}
        className="mx-auto mb-4 h-[58px] max-w-[230px] object-contain"
      />
      <Dropdown
        open={dropdownOpen}
        menu={menu}
        trigger={[]}
        placement="bottom"
        styles={{ root: { width: searchWidth ?? '100%', minWidth: searchWidth ?? undefined, maxWidth: searchWidth ?? undefined } }}
      >
        <div ref={searchBoxRef} className="flex items-center rounded-xl border border-[var(--spirit-border)] bg-[var(--spirit-surface)] p-1.5 shadow-[var(--spirit-shadow)] transition-colors focus-within:border-[var(--spirit-accent)]">
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
            placeholder={SEARCH_PLACEHOLDER}
            aria-label="搜索内容或网址"
            className="min-w-0 flex-1 [&_.ant-input]:!bg-transparent [&_.ant-input]:!outline-none [&.ant-input-borderless:focus-visible]:!outline-none [&.ant-input-borderless:has(input:focus-visible)]:!outline-none"
            onChange={(event) => {
              setValue(event.target.value)
              // 下拉是否真的显示交给 dropdownOpen 判断：有命中就开，清空输入就自动关
              setOpen(true)
            }}
            onFocus={() => {
              if (entries.length === 0) return
              setOpen(true)
              setActive({ key: listKey, index: 0 })
            }}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onCompositionStart={() => { composingRef.current = true }}
            onCompositionEnd={() => { composingRef.current = false }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && entries.length > 0) {
                event.preventDefault()
                setOpen(true)
                moveActive(1)
              } else if (event.key === 'ArrowUp' && entries.length > 0) {
                event.preventDefault()
                setOpen(true)
                moveActive(-1)
              } else if (event.key === 'Enter') {
                // 中文输入法组词阶段的 Enter 用于上屏，不能当作搜索提交。
                if (composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229) return
                event.preventDefault()
                if (dropdownOpen && activeIndex >= 0) activate(entries[activeIndex])
                else submit(value)
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
