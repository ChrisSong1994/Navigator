import { Checkbox, Tooltip } from 'antd'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { TreeSettings } from '../../lib/treeSettings.ts'
import { readTreeSettings, writeTreeSettings } from '../../lib/treeSettings.ts'
import { SelectedNodeProvider } from './SelectedNodeContext.tsx'
import { treeAdapterFromConfig } from './core/TreeAdapter.ts'
import type { AdapterConfig } from './core/TreeAdapter.ts'
import focusNodes from './focusNodes.ts'
import Element from './tree/Element.tsx'
import { publish } from './utils/pubsub.ts'

/**
 * AST 树。
 *
 * 跟原版比，这里补了原版缺的那一半：原版的 tree.css 只剩布局（容器、缩进、折叠），
 * `.entry` / `.key` / `.s` / `.highlighted` 这些真正决定长相的规则一条都没有 ——
 * 树是能跑，但几百行全是黑字。样式见 AstExplorer.css。
 *
 * 另外原版的自动聚焦是死的：`position` 从页面传下来就没人接着往下传，
 * TreeAdapter.isInRange 永远收到 -1。这边页面把编辑器的光标位置接上了（见 index.tsx）。
 */

interface IProps {
  ast: any
  /** 读这棵 AST 的配置：{ type: 'estree' | 'json' | 'yaml' }，调用方要把它 memo 稳，否则整棵树每次都会重画 */
  treeAdapter: AdapterConfig
  /** 光标在源码里的偏移量 */
  position?: number
}

const Tree = ({ ast, treeAdapter: adapterConfig, position }: IProps) => {
  const [settings, setSettings] = useState<TreeSettings>(() => readTreeSettings())

  const updateSettings = (name: string, checked: boolean) => {
    const next = { ...settings, [name]: checked }
    setSettings(next)
    writeTreeSettings(next)
  }

  const treeAdapter = useMemo(
    () => treeAdapterFromConfig(adapterConfig, settings),
    [adapterConfig, settings],
  )

  const rootElement = useRef<HTMLUListElement>(null)

  // 每个命中的节点在 render 里把自己登记进来（见 Element），这里把上一次的登记清掉
  focusNodes('init')
  useLayoutEffect(() => {
    focusNodes('focus', rootElement)
  })

  return (
    <div className="ast-tool-tree">
      <div className="ast-tool-tree-toolbar">
        <Tooltip title="源码光标走到哪个节点，就自动展开并滚到那个节点">
          <Checkbox
            checked={settings.autofocus}
            onChange={(event) => updateSettings('autofocus', event.target.checked)}
          >
            自动聚焦
          </Checkbox>
        </Tooltip>
        {treeAdapter.getConfigurableFilters().map((filter) => (
          <Checkbox
            key={filter.key}
            checked={Boolean(settings[filter.key])}
            onChange={(event) => updateSettings(filter.key, event.target.checked)}
          >
            {`隐藏${filter.label}`}
          </Checkbox>
        ))}
      </div>

      <ul
        ref={rootElement}
        className="ast-tool-tree-root spirit-scroll"
        onMouseLeave={() => {
          publish('CLEAR_HIGHLIGHT')
        }}
      >
        <SelectedNodeProvider>
          <Element
            value={ast}
            level={0}
            treeAdapter={treeAdapter}
            autofocus={settings.autofocus}
            position={position}
          />
        </SelectedNodeProvider>
      </ul>
    </div>
  )
}

export default Tree
