/**
 * 结构图的常量。
 *
 * 原项目这里还带着 JSON Crack 那一整套主题色（几十个十六进制），GraphView 只用到其中
 * 「节点文字色」和「搜索命中的绿」两种，其余没有任何地方引用，就不跟着搬了。
 */

export const NODE_DIMENSIONS = {
  ROW_HEIGHT: 24, // 普通行高
  PARENT_HEIGHT: 36, // 有子节点的行高
} as const

/** 节点数超过这个数就不画图了（原项目同样，再多画布会卡住） */
export const SUPPORTED_LIMIT = 800

export const NODE_COLORS = {
  TEXT: '#000',
  NODE_KEY: '#761CEA',
  NODE_VALUE: '#535353',
  INTEGER: '#FD0079',
  NULL: '#afafaf',
  BOOL: {
    FALSE: '#FF0000',
    TRUE: '#748700',
  },
  CHILD_COUNT: '#535353',
  DIVIDER: '#e6e6e6',
} as const

export const THEME = {
  /** 搜索命中节点的描边（原项目 THEME.TEXT_POSITIVE） */
  TEXT_POSITIVE: '#008736',
} as const
