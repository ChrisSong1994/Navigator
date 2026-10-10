import { BgColorsOutlined, DeleteOutlined, DownloadOutlined, ExportOutlined, InboxOutlined, PlusOutlined, ReloadOutlined, RollbackOutlined } from '@ant-design/icons'
import { Alert, App, Button, Checkbox, ColorPicker, Drawer, Input, Modal, Popconfirm, Segmented, Slider, Space, Tabs, Tag, Upload } from 'antd'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { groupStats, parseBookmarksHtml } from '../config/bookmarks.ts'
import { useConfig } from '../config/configContext.ts'
import type { ImportMode, ImportPayload } from '../config/configContext.ts'
import { mergeImported } from '../config/merge.ts'
import { DEFAULT_PRIMARY_COLOR, LINK_CARD_GAP_RANGE, LINK_FONT_SIZE_RANGE } from '../config/schema.ts'
import type { NavGroup, ThemeMode, ViewMode } from '../config/schema.ts'
import { readConfigText } from '../config/storage.ts'
import { GroupEditor } from './GroupEditor.tsx'

/** 待上传的文件：只读一次文本，解析放在 useMemo 里，勾选框一变预览就跟着变 */
interface PendingUpload {
  file: File
  kind: 'json' | 'bookmarks'
  text: string
}

/** 解析结果：成功给载荷，失败给消息（在弹窗里展示，用户能看清哪里不对） */
type ParsedUpload =
  | { ok: true; payload: ImportPayload; stats: ReturnType<typeof groupStats> }
  | { ok: false; message: string }

const formatSize = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`

/** 丢弃图标：页面本来就有首字母色块兜底，用于把 ~1MB 的 base64 挡在 localStorage 之外 */
function dropIcons(groups: Record<string, NavGroup>): Record<string, NavGroup> {
  return Object.fromEntries(
    Object.entries(groups).map(([id, group]) => [id, { ...group, links: group.links.map((link) => ({ ...link, icon: '' })) }]),
  )
}

const MAX_LOGO_SIZE = 512 * 1024
const PRESETS = [
  { label: '推荐', colors: [DEFAULT_PRIMARY_COLOR, '#722ed1', '#eb2f96', '#13c2c2', '#52c41a', '#fa8c16', '#f5222d', '#1677ff'] },
]

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-sm font-medium text-[var(--spirit-text)]">{label}</span>
        {hint && <span className="text-xs text-[var(--spirit-muted)]">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function ConfigDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, groups, groupIds, linkCount, updateSettings, addGroup, applyImport, exportConfig, exportBookmarks, remargeRuntime, resetToRuntime, storageError, mergeNotice, dismissMergeNotice } =
    useConfig()
  const { message } = App.useApp()
  const [pending, setPending] = useState<PendingUpload | null>(null)
  const [titleDraft, setTitleDraft] = useState<string | null>(null)
  /** 上传的落地方式：默认合并（安全的那一侧），替换要在弹窗里显式选 */
  const [importMode, setImportMode] = useState<ImportMode>('merge')
  const [keepIcons, setKeepIcons] = useState(true)

  const uploadLogo = (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件')
      return
    }
    if (file.size > MAX_LOGO_SIZE) {
      message.error('Logo 图片不能超过 512 KB')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') updateSettings({ siteLogo: reader.result })
      else message.error('图片读取失败，请换一张试试')
    }
    reader.onerror = () => message.error('图片读取失败，请换一张试试')
    reader.readAsDataURL(file)
  }

  // 解析与「会发生什么」都由 pending / 勾选项派生，勾选框一动预览即时更新，不用重读文件
  const parsed = useMemo<ParsedUpload | null>(() => {
    if (!pending) return null
    try {
      // 书签 HTML 在解析时就不装图标；配置 JSON 里的图标解析完再统一摘掉，两条路径的预览口径一致
      if (pending.kind === 'bookmarks') {
        const { groups: bookmarks } = parseBookmarksHtml(pending.text, { keepIcons })
        return { ok: true, payload: { groups: bookmarks, settings: null, source: 'bookmarks' }, stats: groupStats(bookmarks) }
      }
      const config = readConfigText(pending.text)
      const groups = keepIcons ? config.groups : dropIcons(config.groups)
      if (Object.keys(groups).length === 0) throw new Error('文件里没有任何分组，导入不会带来任何内容')
      return { ok: true, payload: { groups, settings: config.settings, source: 'json' }, stats: groupStats(groups) }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
  }, [pending, keepIcons])

  const outcome = useMemo(() => {
    if (!parsed?.ok) return null
    const incomingGroups: Record<string, NavGroup> = parsed.payload.groups
    if (importMode === 'replace') {
      const next = groupStats(incomingGroups)
      return { replaced: true, nextGroups: next.groups, nextLinks: next.links, addedGroups: 0, addedLinks: 0, skipped: 0 }
    }
    const merged = mergeImported(groups, incomingGroups)
    return {
      replaced: false,
      nextGroups: 0,
      nextLinks: 0,
      addedGroups: merged.addedGroupIds.length,
      addedLinks: merged.addedLinks.length,
      skipped: merged.skippedLinks,
    }
  }, [parsed, importMode, groups])

  const confirmImport = () => {
    if (!parsed?.ok) return
    try {
      const result = applyImport(parsed.payload, importMode)
      message.success(
        result.mode === 'replace'
          ? `已替换为：${result.addedGroups} 个分组 / ${result.addedLinks} 条链接`
          : `已合并：新增 ${result.addedGroups} 个分组 / ${result.addedLinks} 条链接${result.skippedLinks > 0 ? `，跳过 ${result.skippedLinks} 条已存在` : ''}`,
      )
    } catch (error) {
      message.error(`导入失败：${(error as Error).message}`)
    } finally {
      setPending(null)
    }
  }

  const appearance = (
    <div className="pb-4">
      <SettingRow label="站点标题">
        <Input
          value={titleDraft ?? settings.siteTitle}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={() => {
            if (titleDraft !== null) updateSettings({ siteTitle: titleDraft.trim() || settings.siteTitle })
            setTitleDraft(null)
          }}
          onPressEnter={(event) => (event.target as HTMLInputElement).blur()}
        />
      </SettingRow>

      <SettingRow label="站点 Logo" hint="建议使用正方形图片，最大 512 KB">
        <div className="flex items-center gap-3 rounded-lg border border-[var(--spirit-border)] bg-[var(--spirit-inset)] p-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--spirit-surface)]">
            {settings.siteLogo ? (
              <img src={settings.siteLogo} alt="站点 Logo 预览" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[11px] text-[var(--spirit-muted)]">无 Logo</span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Upload accept="image/*" showUploadList={false} beforeUpload={(file) => { uploadLogo(file); return false }}>
              <Button>上传图片</Button>
            </Upload>
            {settings.siteLogo && (
              <Button danger type="text" icon={<DeleteOutlined />} onClick={() => updateSettings({ siteLogo: '' })}>
                移除
              </Button>
            )}
          </div>
        </div>
      </SettingRow>

      <SettingRow label="主题模式">
        <Segmented
          block
          value={settings.themeMode}
          onChange={(value) => updateSettings({ themeMode: value as ThemeMode })}
          options={[
            { label: '跟随系统', value: 'system' },
            { label: '浅色', value: 'light' },
            { label: '深色', value: 'dark' },
          ]}
        />
      </SettingRow>

      <SettingRow label="主题色" hint={`留空则使用默认主色 ${DEFAULT_PRIMARY_COLOR}`}>
        <Space>
          <ColorPicker
            value={settings.primaryColor || DEFAULT_PRIMARY_COLOR}
            disabledAlpha
            presets={PRESETS}
            onChange={(color) => updateSettings({ primaryColor: color.toHexString() })}
            showText
          />
          <Button size="small" icon={<BgColorsOutlined />} onClick={() => updateSettings({ primaryColor: '' })}>
            用默认
          </Button>
        </Space>
      </SettingRow>

      <SettingRow label="链接字号" hint={`${settings.linkFontSize}px`}>
        <Slider
          min={LINK_FONT_SIZE_RANGE[0]}
          max={LINK_FONT_SIZE_RANGE[1]}
          value={settings.linkFontSize}
          onChange={(value) => updateSettings({ linkFontSize: value })}
        />
      </SettingRow>

      <SettingRow label={settings.viewMode === 'card' ? '卡片间距' : '列表行间距'} hint={`${settings.linkCardGap}px`}>
        <Slider
          min={LINK_CARD_GAP_RANGE[0]}
          max={LINK_CARD_GAP_RANGE[1]}
          value={settings.linkCardGap}
          onChange={(value) => updateSettings({ linkCardGap: value })}
        />
      </SettingRow>

      <SettingRow label="默认展示模式">
        <Segmented
          block
          value={settings.viewMode}
          onChange={(value) => updateSettings({ viewMode: value as ViewMode })}
          options={[
            { label: '卡片', value: 'card' },
            { label: '列表', value: 'list' },
          ]}
        />
      </SettingRow>
    </div>
  )

  const dataTab = (
    <div className="space-y-4 pb-4">
      <Space wrap>
        <Button icon={<DownloadOutlined />} onClick={exportConfig}>
          导出 JSON
        </Button>
        <Button icon={<ExportOutlined />} onClick={exportBookmarks}>
          导出 Chrome 书签
        </Button>
      </Space>

      <div className="text-xs leading-6 text-[var(--spirit-muted)]">
        导出内容与 <code>global_original.json5</code>、<code>src/global_runtime.json</code> 结构完全一致，
        可以直接拿去替换源配置，也可以再上传回来。
        <br />
        书签文件是 Chrome 的书签格式（<code>NETSCAPE-Bookmark-file-1</code>），在 Chrome 的书签管理器里
        「导入书签和设置」选它即可；分组按标题里的 <code> / </code> 拆成文件夹层级，「常用」那一组写在书签栏下。
      </div>

      <Upload.Dragger
        accept=".json,.json5,.html,.htm"
        showUploadList={false}
        beforeUpload={async (file) => {
          try {
            const text = await file.text()
            setImportMode('merge')
            setKeepIcons(true)
            setPending({ file, kind: /\.html?$/i.test(file.name) ? 'bookmarks' : 'json', text })
          } catch (error) {
            message.error(`读取文件失败：${(error as Error).message}`)
          }
          return false
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">点击或拖拽文件到这里上传</p>
        <p className="ant-upload-hint">
          支持标准配置 JSON，以及 Chrome 导出的书签 HTML（书签栏 → 导出书签文件）
        </p>
      </Upload.Dragger>

      <Space wrap className="mt-4">
        <Button icon={<ReloadOutlined />} onClick={remargeRuntime}>
          重新合并内置配置
        </Button>
        <Popconfirm
          title="恢复内置配置？"
          description="本地修改（含新增分组、隐藏的链接）会被清空"
          okText="恢复"
          cancelText="取消"
          onConfirm={resetToRuntime}
        >
          <Button danger icon={<RollbackOutlined />}>
            恢复内置配置
          </Button>
        </Popconfirm>
      </Space>

      <div className="text-xs leading-6 text-[var(--spirit-muted)]">
        当前：{groupIds.length} 个分组 / {linkCount} 条链接。
        <br />
        合并规则：本地改动优先，内置配置新增的分组与链接会自动并入，本地删掉的不会被合并回来。
      </div>

      {mergeNotice && (
        <Alert
          type="info"
          showIcon
          closable={{ onClose: dismissMergeNotice }}
          title="内置配置有更新，已与本地配置合并"
          description="本地改动保留，内置配置新增的内容已追加进来。"
        />
      )}
      {storageError && <Alert type="error" showIcon title="本地存储不可用" description={storageError} />}
    </div>
  )

  const groupTab = (
    <div className="space-y-3 pb-4">
      <div className="flex items-center gap-2">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => addGroup()}>
          新增分组
        </Button>
        <span className="text-xs text-[var(--spirit-muted)]">
          共 <Tag>{groupIds.length}</Tag> 个分组
        </span>
      </div>
      <GroupEditor />
    </div>
  )

  return (
    <>
      <Drawer title="配置面板" size={560} open={open} onClose={onClose} styles={{ body: { paddingTop: 8 } }}>
        <Tabs
          items={[
            { key: 'appearance', label: '外观', children: appearance },
            { key: 'groups', label: '分组', children: groupTab },
            { key: 'data', label: '数据', children: dataTab },
          ]}
        />
      </Drawer>

      <Modal
        open={pending !== null}
        title={parsed?.ok === false ? '文件解析失败' : '上传配置'}
        width={460}
        okText={importMode === 'replace' ? '全部替换' : '合并'}
        cancelText="取消"
        okButtonProps={{ disabled: parsed?.ok !== true, danger: importMode === 'replace' }}
        onCancel={() => setPending(null)}
        onOk={confirmImport}
      >
        <p className="mb-3 text-xs text-[var(--spirit-muted)]">
          文件：{pending?.file.name}（{pending?.kind === 'bookmarks' ? 'Chrome 书签 HTML' : '配置 JSON'}）
        </p>

        {parsed && !parsed.ok && (
          <Alert type="error" showIcon title="这份文件没法解析" description={parsed.message} />
        )}

        {parsed?.ok && (
          <div className="space-y-4">
            <div className="rounded-lg bg-[var(--spirit-inset)] p-3 text-xs leading-6 text-[var(--spirit-text)]">
              解析出 <b>{parsed.stats.groups}</b> 个分组 / <b>{parsed.stats.links}</b> 条链接
              {parsed.stats.icons > 0 && <>，其中 {parsed.stats.icons} 条带图标</>}
              <br />
              约 {formatSize(parsed.stats.bytes)}，会写入浏览器本地存储
            </div>

            <SettingRow label="落地方式" hint={importMode === 'merge' ? '并进现有配置' : '不保留当前内容'}>
              <Segmented
                block
                value={importMode}
                onChange={(value) => setImportMode(value as ImportMode)}
                options={[
                  { label: '合并', value: 'merge' },
                  { label: '全部替换', value: 'replace' },
                ]}
              />
            </SettingRow>

            <div>
              <Checkbox checked={keepIcons} onChange={(event) => setKeepIcons(event.target.checked)}>
                保留 base64 图标（不勾选则用首字母色块兜底，配置体积会小很多）
              </Checkbox>
            </div>

            {outcome && (
              <div className="text-xs leading-6 text-[var(--spirit-muted)]">
                {outcome.replaced ? (
                  <>
                    当前的 {groupIds.length} 个分组 / {linkCount} 条链接会被替换成这 {outcome.nextGroups} 个分组 /{' '}
                    {outcome.nextLinks} 条链接。
                  </>
                ) : outcome.addedGroups === 0 && outcome.addedLinks === 0 ? (
                  <>这份文件里的内容都已经在配置里了，合并不会改动任何东西。</>
                ) : (
                  <>
                    新增 {outcome.addedGroups} 个分组 / {outcome.addedLinks} 条链接
                    {outcome.skipped > 0 && <>，跳过 {outcome.skipped} 条已存在</>}；同名分组的链接会并进去，
                    你现有的链接、顺序和标题都不动，外观设置也不受影响。
                  </>
                )}
              </div>
            )}

            {importMode === 'replace' && (
              <Alert
                type="warning"
                showIcon
                title="这是破坏性操作"
                description={`当前 ${groupIds.length} 个分组 / ${linkCount} 条链接会被整份替换掉（内置配置不受影响）。想回到内置内容可以用「恢复内置配置」。`}
              />
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
