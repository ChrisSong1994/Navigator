/**
 * 节点里的一段文字：是链接就给 <a>，是颜色值就加一个色块。
 * 竖着搬自 developer-assistant 的 GraphView/CustomNode/TextRenderer.tsx，
 * 但原文件是把拼好的 HTML 塞进 dangerouslySetInnerHTML，JSON 里的内容直接当 HTML 使了；
 * 这里改成用 React 元素渲染链接，视觉一样，也不会被内容里的标签影响。
 */
import React from 'react'
import styled from 'styled-components'

const StyledRow = styled.span`
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  gap: 4px;
  vertical-align: middle;
`

const StyledSwatch = styled.span<{ $color: string }>`
  display: inline-block;
  flex: none;
  width: 12px;
  height: 12px;
  border-radius: 4px;
  border: 1px solid rgba(106, 116, 128, 0.28);
  background-color: ${({ $color }) => $color};
`

const URL_PATTERN =
  /^(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([-.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$/i

const isURL = (word: string) => URL_PATTERN.test(word)

/** 原文件的匹配规则允许省略协议，省略时按 https 补上，免得被当成相对地址或 javascript: */
const toHref = (word: string) => (/^https?:\/\//i.test(word) ? word : `https://${word}`)

export const TextRenderer = ({ children }: React.PropsWithChildren) => {
  if (typeof children === 'string' && isURL(children)) {
    return (
      <a
        href={toHref(children)}
        style={{ textDecoration: 'underline', pointerEvents: 'all' }}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </a>
    )
  }

  if (typeof children === 'string' && isColorFormat(children)) {
    return (
      <StyledRow>
        <StyledSwatch $color={children} />
        {children}
      </StyledRow>
    )
  }

  return <>{`${children}`}</>
}

function isColorFormat(colorString: string) {
  const hexCodeRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
  const rgbRegex = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/
  const rgbaRegex = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(0|1|0\.\d+)\s*\)$/

  return (
    hexCodeRegex.test(colorString) || rgbRegex.test(colorString) || rgbaRegex.test(colorString)
  )
}
