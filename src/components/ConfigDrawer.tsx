import { BgColorsOutlined, DownloadOutlined, PlusOutlined, ReloadOutlined, RollbackOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, App, Button, ColorPicker, Drawer, Input, Modal, Popconfirm, Segmented, Slider, Space, Tabs, Tag, Upload } from 'antd'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useConfig } from '../config/configContext.ts'
import { LINK_CARD_GAP_RANGE, LINK_FONT_SIZE_RANGE } from '../config/schema.ts'
import type { ThemeMode, ViewMode } from '../config/schema.ts'
import { GroupEditor } from './GroupEditor.tsx'

const DEFAULT_PRIMARY = '#1677ff'
const PRESETS = [
  { label: '推荐', colors: ['#1677ff', '#2f54eb', '#722ed1', '#eb2f96', '#13c2c2', '#52c41a', '#fa8c16', '#f5222d'] },
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
  const { settings, groupIds, linkCount, updateSettings, addGroup, importConfig, exportConfig, remargeRuntime, resetToRuntime, storageError, mergeNotice, dismissMergeNotice } =
    useConfig()
  const { message } = App.useApp()
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [titleDraft, setTitleDraft] = useState<string | null>(null)

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

      <SettingRow label="主题色" hint="留空则使用 antd 默认主色">
        <Space>
          <ColorPicker
            value={settings.primaryColor || DEFAULT_PRIMARY}
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
        <Upload
          accept=".json,.json5"
          showUploadList={false}
          beforeUpload={(file) => {
            setPendingFile(file)
            return false
          }}
        >
          <Button icon={<UploadOutlined />}>导入 JSON</Button>
        </Upload>
      </Space>

      <div className="text-xs leading-6 text-[var(--spirit-muted)]">
        导出内容与 <code>global_original.json5</code>、<code>src/global_runtime.json</code> 结构完全一致，
        可以直接拿去替换源配置，也可以再导入回来。
      </div>

      <Space wrap>
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
          closable
          onClose={dismissMergeNotice}
          message="内置配置有更新，已与本地配置合并"
          description="本地改动保留，内置配置新增的内容已追加进来。"
        />
      )}
      {storageError && <Alert type="error" showIcon message="本地存储不可用" description={storageError} />}
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
        open={pendingFile !== null}
        title="导入配置"
        okText="导入"
        cancelText="取消"
        onCancel={() => setPendingFile(null)}
        onOk={async () => {
          if (!pendingFile) return
          try {
            await importConfig(pendingFile)
            message.success('配置已导入，并写入本地存储')
          } catch (error) {
            message.error(`导入失败：${(error as Error).message}`)
          } finally {
            setPendingFile(null)
          }
        }}
      >
        <p>导入会覆盖浏览器本地存储里的配置（内置配置不受影响）。</p>
        <p className="text-xs text-[var(--spirit-muted)]">文件：{pendingFile?.name}</p>
      </Modal>
    </>
  )
}
