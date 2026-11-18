import {
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  HomeOutlined,
  SettingOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  ConfigProvider as AntConfigProvider,
  Input,
  Select,
  Skeleton,
  Tooltip,
  theme as antdTheme,
} from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { LinkIcon } from '../../components/LinkIcon.tsx'
import { ToolList } from '../../components/ToolList.tsx'
import { findFavoriteInGroup, findFavorites } from '../../config/favorite.ts'
import { DEFAULT_PRIMARY_COLOR } from '../../config/schema.ts'
import type { NavLink, NavSettings } from '../../config/schema.ts'
import { useResolvedTheme } from '../../hooks/useResolvedTheme.ts'
import { closePopup, openHomeTab, openSettingsTab, openToolTab, readActivePage, unfavoritableReason } from '../tabs.ts'
import type { ActivePage } from '../tabs.ts'
import { readLastGroup, writeLastGroup } from './prefs.ts'
import { usePopupConfig } from './usePopupConfig.ts'
import type { PopupConfigStore } from './usePopupConfig.ts'

/** 分组下拉里「新建分组」那一项的哨兵值；真实分组 id 是 group-N 或配置里自定的 key，撞不上 */
const NEW_GROUP = '__new__'

/**
 * 扩展图标点开的小弹窗：收藏当前页 + 工具列表 + 几个常用开关。
 *
 * 它和首页共用同一份配置（config/storage.ts），收藏就是往 groups 里加一条链接 ——
 * 所以跨设备同步、内置配置合并、新标签页渲染都不用在这一侧另做一套。
 *
 * 宽 340：Chrome 弹窗最大 800x600，工具那 5 项的说明文字再宽也是截断，不如窄一点少占屏幕。
 */
export function Popup() {
  const store = usePopupConfig()

  return (
    <PopupTheme settings={store.settings}>
      <PopupBody store={store} />
    </PopupTheme>
  )
}

/** antd 主题跟着配置里的主题模式 / 主色走，和首页 App.tsx 里的 ThemedShell 同一套规则 */
function PopupTheme({ settings, children }: { settings: NavSettings; children: ReactNode }) {
  const resolved = useResolvedTheme(settings.themeMode)
  const accent = settings.primaryColor || DEFAULT_PRIMARY_COLOR
  const themeConfig = useMemo(
    () => ({
      algorithm: resolved === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: { colorPrimary: accent, borderRadius: 12 },
    }),
    [accent, resolved],
  )

  useEffect(() => {
    document.documentElement.style.setProperty('--spirit-accent', accent)
  }, [accent])

  return (
    <AntConfigProvider locale={zhCN} theme={themeConfig}>
      {children}
    </AntConfigProvider>
  )
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span className="h-3.5 w-1 shrink-0 rounded-full bg-[var(--spirit-accent)]" />
      <h2 className="text-[13px] font-semibold tracking-tight text-[var(--spirit-text)]">{title}</h2>
      {hint && <span className="ml-auto truncate text-[11px] text-[var(--spirit-muted)]">{hint}</span>}
    </div>
  )
}

function PopupBody({ store }: { store: PopupConfigStore }) {
  return (
    <div className="spirit-popup-root text-[var(--spirit-text)]">
      <header className="spirit-popup-header flex items-center gap-2 rounded-2xl px-3 py-2.5">
        <span className="min-w-0 truncate text-sm font-semibold tracking-tight">{store.settings.siteTitle}</span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Tooltip title="配置面板">
            <Button
              size="small"
              type="text"
              icon={<SettingOutlined />}
              aria-label="配置面板"
              onClick={() => {
                openSettingsTab()
                closePopup()
              }}
            />
          </Tooltip>
          <Tooltip title="打开新标签页">
            <Button
              size="small"
              type="text"
              icon={<HomeOutlined />}
              aria-label="打开新标签页"
              onClick={() => {
                openHomeTab()
                closePopup()
              }}
            />
          </Tooltip>
        </div>
      </header>

      <div className="spirit-scroll flex max-h-[512px] flex-col gap-3 overflow-y-auto pb-1">
        {store.error && (
          <Alert type="error" showIcon message={store.error} closable onClose={store.dismissError} />
        )}

        <section className="spirit-popup-card rounded-2xl px-3 py-3">
          <SectionTitle title="收藏当前页" />
          <FavoriteSection store={store} />
        </section>

        <section className="spirit-popup-card rounded-2xl px-3 py-3">
          <SectionTitle title="工具箱" hint="在新标签页里打开" />
          <div className="spirit-popup-tools">
            <ToolList
              layout="grid"
              onSelect={(key) => {
                openToolTab(key)
                closePopup()
              }}
            />
          </div>
        </section>

      </div>
    </div>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * 收藏区。
 *
 * 三种形态：正常（读到了可收藏的地址，显示 favicon + 标题 + 域名）、手填（地址读不到 / 不该收藏时
 * 直接给两个输入框，也是普通网页里打开 popup.html 的形态）、新建分组（下拉里选了「＋ 新建分组…」，
 * 或者配置里一个分组都没有）。
 */
function FavoriteSection({ store }: { store: PopupConfigStore }) {
  const [page, setPage] = useState<ActivePage | null>(null)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [lastGroup, setLastGroup] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void readActivePage().then((value) => {
      if (cancelled) return
      setPage(value)
      setTitle(value.title)
      setUrl(value.url)
    })
    void readLastGroup().then((value) => {
      if (!cancelled) setLastGroup(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const groupId = useMemo(() => {
    if (selected && store.groups[selected]) return selected
    if (lastGroup && store.groups[lastGroup]) return lastGroup
    return store.groupIds[0] ?? null
  }, [selected, lastGroup, store.groups, store.groupIds])

  const pickGroup = useCallback((id: string) => {
    setSelected(id)
    void writeLastGroup(id)
  }, [])

  const href = url.trim()
  const reason = unfavoritableReason(href)
  // 地址读不到、或者当前页本来就不该收藏时，直接给输入框让用户自己填
  const manual = editing || reason !== null
  const link: NavLink = { icon: page?.icon ?? '', href, text: title.trim() || hostOf(href) }
  const canSave = reason === null && Boolean(link.text)
  const inThisGroup = Boolean(findFavoriteInGroup(store.groups[groupId ?? ''], href))
  const hits = href ? findFavorites(store.groups, href).filter((hit) => hit.groupId !== groupId) : []

  const mustCreate = store.ready && store.groupIds.length === 0
  const showCreateRow = creating || mustCreate

  const save = async () => {
    if (!groupId || !canSave) return
    setBusy(true)
    await store.favorite(groupId, link)
    setBusy(false)
  }

  const createAndSave = async () => {
    if (!newTitle.trim() || !canSave) return
    setBusy(true)
    const id = await store.createGroupWithFavorite(newTitle, link)
    setBusy(false)
    if (!id) return
    pickGroup(id)
    setCreating(false)
    setNewTitle('')
  }

  const groupOptions = store.groupIds.map((id) => ({ value: id, label: store.groups[id].title }))

  return (
    <div className="flex flex-col gap-2">
      {manual ? (
        <div className="flex flex-col gap-1.5">
          <Input
            size="small"
            value={title}
            placeholder="页面标题"
            onChange={(event) => setTitle(event.target.value)}
          />
          <Input
            size="small"
            value={url}
            placeholder="https://…"
            onChange={(event) => setUrl(event.target.value)}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--spirit-popup-border)] bg-[var(--spirit-popup-inset)] px-3 py-2.5">
          <LinkIcon link={link} size={20} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] leading-tight" title={link.text}>
              {link.text}
            </div>
            <div className="truncate text-[11px] leading-tight text-[var(--spirit-muted)]" title={href}>
              {hostOf(href)}
            </div>
          </div>
          <Tooltip title="改标题 / 地址">
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing(true)} />
          </Tooltip>
        </div>
      )}

      {reason && <p className="m-0 text-[11px] text-[var(--spirit-muted)]">{reason}</p>}

      {showCreateRow ? (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            size="small"
            value={newTitle}
            maxLength={24}
            placeholder="新分组名称"
            onChange={(event) => setNewTitle(event.target.value)}
            onPressEnter={() => void createAndSave()}
          />
          <Button
            size="small"
            type="primary"
            icon={<CheckOutlined />}
            aria-label="创建分组并收藏"
            loading={busy}
            disabled={!newTitle.trim() || !canSave}
            onClick={() => void createAndSave()}
          />
          {!mustCreate && (
            <Button
              size="small"
              type="text"
              icon={<CloseOutlined />}
              aria-label="取消新建"
              onClick={() => {
                setCreating(false)
                setNewTitle('')
              }}
            />
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-[var(--spirit-muted)]">分组</span>
          {store.ready ? (
            <Select
              className="min-w-0 flex-1"
              size="small"
              value={groupId ?? undefined}
              placeholder="选择分组"
              options={[...groupOptions, { value: NEW_GROUP, label: '＋ 新建分组…' }]}
              onChange={(value) => {
                if (value === NEW_GROUP) setCreating(true)
                else pickGroup(value)
              }}
            />
          ) : (
            <Skeleton.Input size="small" active block />
          )}
        </div>
      )}

      {!showCreateRow && hits.length > 0 && (
        <button
          type="button"
          className="cursor-pointer border-none bg-transparent p-0 text-left text-[11px] text-[var(--spirit-muted)] hover:text-[var(--spirit-accent)]"
          onClick={() => pickGroup(hits[0].groupId)}
        >
          已收藏在「{hits.map((hit) => hit.groupTitle).join('、')}」，点击切到那个分组
        </button>
      )}

      {!showCreateRow && (
        <Button
          block
          size="small"
          type={inThisGroup ? 'default' : 'primary'}
          danger={inThisGroup}
          icon={inThisGroup ? <StarFilled /> : <StarOutlined />}
          loading={busy}
          disabled={!canSave || !groupId}
          onClick={() => (inThisGroup ? void store.unfavorite(groupId!, href) : void save())}
        >
          {inThisGroup ? '取消收藏' : '收藏'}
        </Button>
      )}
    </div>
  )
}
