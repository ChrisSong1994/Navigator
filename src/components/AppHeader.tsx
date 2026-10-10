import { SearchOutlined, SettingOutlined } from "@ant-design/icons";
import { Button, Input, Tooltip } from "antd";
import { useConfig } from "../config/configContext.ts";

interface AppHeaderProps {
  keyword: string;
  onKeywordChange: (value: string) => void;
  onOpenSettings: () => void;
}

/** 顶栏只放标题、统计、搜索和配置入口；主题 / 展示模式等开关都收在配置面板里，不重复出现 */
export function AppHeader({
  keyword,
  onKeywordChange,
  onOpenSettings,
}: AppHeaderProps) {
  const { settings, groupIds, linkCount } = useConfig();

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--spirit-border)] bg-[var(--spirit-surface)]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-x-4 gap-y-3 px-6 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {settings.siteLogo && (
            <img src={settings.siteLogo} alt="" className="h-7 w-7 shrink-0 rounded-md object-contain" />
          )}
          <span className="truncate text-[17px] font-semibold tracking-tight text-[var(--spirit-text)]">
            {settings.siteTitle}
          </span>
          <span className="shrink-0 text-xs text-[var(--spirit-muted)]">
            {groupIds.length} 组 · {linkCount} 链接
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Input
            allowClear
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            prefix={<SearchOutlined className="text-[var(--spirit-muted)]" />}
            placeholder="搜索链接或分组"
            className="w-[240px]"
          />
          <Tooltip title="配置面板">
            <Button icon={<SettingOutlined />} onClick={onOpenSettings} />
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
