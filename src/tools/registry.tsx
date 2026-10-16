import {
  BgColorsOutlined,
  CodeOutlined,
  FileMarkdownOutlined,
  PartitionOutlined,
} from '@ant-design/icons'
import { lazy } from 'react'
import type { ComponentType, ReactNode } from 'react'

export interface ToolEntry {
  key: string
  title: string
  /** 工具箱列表里的说明，也当工具页头部那句定位 */
  description: string
  icon: ReactNode
  content: ComponentType
}

/**
 * 工具箱里现有的工具；加新工具就在这里加一条，工具箱抽屉和工具页都是照着它渲染的。
 *
 * content 用 lazy 包一层：JSON 工具那一整套（monaco / reaflow / jsonpath 等）就它用得上，拆成独立 chunk 后
 * 新标签页首屏不必为「用户可能永远不会点开」的工具付出这些字节。
 * lazy() 写在模块级的数组字面量里，只求值一次，组件引用是稳定的。
 */
export const TOOLS: ToolEntry[] = [
  {
    key: 'color',
    title: '颜色',
    description: '取色 / HEX·RGB·CMYK·HSV·HSL 互转 / 颜色记录',
    icon: <BgColorsOutlined />,
    content: lazy(() => import('./Color/index.tsx')),
  },
  {
    key: 'json',
    title: 'JSON',
    description: '格式化 / 压缩 / 校验 / 修复 / JSONPath / 结构图',
    icon: <CodeOutlined />,
    content: lazy(() => import('./Json/index.tsx')),
  },
  {
    key: 'markdown',
    title: 'Markdown',
    description: '编写 / 预览 / 导入导出 .md / 公式、图表与代码高亮',
    icon: <FileMarkdownOutlined />,
    content: lazy(() => import('./Markdown/index.tsx')),
  },
  {
    key: 'ast',
    title: 'AST',
    description: '源码转 AST / 树与 JSON 两种视图 / 悬停联动源码高亮',
    icon: <PartitionOutlined />,
    content: lazy(() => import('./AstExplorer/index.tsx')),
  },
]

export function findTool(key: string): ToolEntry | undefined {
  return TOOLS.find((tool) => tool.key === key)
}
