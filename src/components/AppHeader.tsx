import { GithubOutlined, SettingOutlined } from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import { useConfig } from "../config/configContext.ts";

const REPOSITORY_URL = "https://github.com/ChrisSong1994/Navigator";
const RELEASES_URL = `${REPOSITORY_URL}/releases`;

interface AppHeaderProps {
  onOpenSettings: () => void;
}

/** 顶栏只放标题、统计和配置入口；搜索 / 筛选收在页面主搜索框里，主题 / 展示模式等开关都收在配置面板里，不重复出现 */
export function AppHeader({ onOpenSettings }: AppHeaderProps) {
  const { settings, groupIds, linkCount, storageMode } = useConfig();
  const isExtension = storageMode === "sync";

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
          {!isExtension && (
            <Button
              type="text"
              href={RELEASES_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              去安装插件
            </Button>
          )}
          <Tooltip title="GitHub 仓库">
            <Button
              type="text"
              icon={<GithubOutlined />}
              href={REPOSITORY_URL}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="GitHub 仓库"
            />
          </Tooltip>
          <Tooltip title="配置面板">
            <Button icon={<SettingOutlined />} onClick={onOpenSettings} />
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
