/**
 * 画布上节点的样式（styled-components）。
 * 竖着搬自 developer-assistant 的 GraphView/CustomNode/styles.tsx：
 * 去掉了 Mantine 的 theme 参数（原文件的 getTextColor 其实没用上 theme），配色改从 constants 取。
 */
import styled from 'styled-components'

import { NODE_DIMENSIONS, NODE_COLORS, THEME } from '../constants.ts'

type TextColorFn = {
  $type?: string
  $value?: string | number | null | boolean
}

function getTextColor({ $value, $type }: TextColorFn) {
  if ($value === null) return NODE_COLORS.NULL
  if ($type === 'object') return NODE_COLORS.NODE_KEY
  if ($type === 'number') return NODE_COLORS.INTEGER
  if ($value === true) return NODE_COLORS.BOOL.TRUE
  if ($value === false) return NODE_COLORS.BOOL.FALSE
  return NODE_COLORS.NODE_VALUE
}

export const StyledForeignObject = styled.foreignObject<{ $isObject?: boolean }>`
  text-align: ${({ $isObject }) => !$isObject && 'center'};
  color: ${NODE_COLORS.TEXT};
  font-family: monospace;
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  pointer-events: none;

  &.searched {
    background: rgba(27, 255, 0, 0.1);
    border: 1px solid ${THEME.TEXT_POSITIVE};
    border-radius: 2px;
    box-sizing: border-box;
  }

  .highlight {
    background: rgba(255, 214, 0, 0.15);
  }

  .renderVisible {
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 12px;
    width: 100%;
    height: 100%;
    overflow: hidden;
    cursor: pointer;
  }
`

export const StyledKey = styled.span<{
  $type: TextColorFn['$type']
  $value?: TextColorFn['$value']
}>`
  display: inline;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-width: 0;
  height: auto;
  line-height: inherit;
  padding: 0;
  color: ${({ $type, $value = '' }) => getTextColor({ $value, $type })};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const StyledRow = styled.span<{ $value: TextColorFn['$value'] }>`
  padding: 3px 10px;
  height: ${NODE_DIMENSIONS.ROW_HEIGHT}px;
  line-height: 18px;
  color: ${({ $value }) => getTextColor({ $value, $type: typeof $value })};
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-bottom: 1px solid ${NODE_COLORS.DIVIDER};
  box-sizing: border-box;

  &:last-of-type {
    border-bottom: none;
  }

  .searched & {
    border-bottom: 1px solid ${THEME.TEXT_POSITIVE};
  }
`

export const StyledChildrenCount = styled.span`
  color: ${NODE_COLORS.CHILD_COUNT};
  padding: 10px;
  margin-left: -15px;
`
