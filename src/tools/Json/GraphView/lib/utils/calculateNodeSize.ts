/**
 * 量一个节点该占多大：拿一个隐藏的 div 让浏览器按同样的字体量一遍。
 * 竖着搬自 developer-assistant 的 GraphView/lib/utils/calculateNodeSize.ts。
 */
import { NODE_DIMENSIONS } from '../../constants.ts'

type Text = number | string | [string, string][]
type Size = { width: number; height: number }

export const isContentImage = (value: Text) => {
  if (typeof value !== 'string') return false

  const isImageURL = /(https?:\/\/.*\.(?:png|jpg|gif|svg))/i.test(value)
  const isBase64 = value.startsWith('data:image/') && value.includes('base64')

  return isImageURL || isBase64
}

const calculateLines = (text: Text): string => {
  if (Array.isArray(text)) {
    return text.map(([k, v]) => `${k}: ${JSON.stringify(v).slice(0, 80)}`).join('\n')
  }

  return `${text}`
}

const calculateWidthAndHeight = (str: string, single = false) => {
  if (!str) return { width: 45, height: 45 }

  const dummyElement = document.createElement('div')
  dummyElement.style.whiteSpace = single ? 'nowrap' : 'pre-wrap'
  dummyElement.innerText = str
  dummyElement.style.fontSize = '12px'
  dummyElement.style.width = 'fit-content'
  dummyElement.style.padding = '0 10px'
  dummyElement.style.fontWeight = '500'
  dummyElement.style.fontFamily = 'monospace'
  document.body.appendChild(dummyElement)

  const clientRect = dummyElement.getBoundingClientRect()
  const lines = str.split('\n').length

  const width = clientRect.width + 4
  const height = single ? NODE_DIMENSIONS.PARENT_HEIGHT : lines * NODE_DIMENSIONS.ROW_HEIGHT

  document.body.removeChild(dummyElement)
  return { width, height }
}

const sizeCache = new Map<Text, Size>()

// 两分钟清一次，免得改内容时越攒越多
setInterval(() => sizeCache.clear(), 120_000)

export const calculateNodeSize = (text: Text, isParent = false) => {
  const isImage = isContentImage(text)

  const cacheKey = [text, isParent].toString()

  const cached = sizeCache.get(cacheKey)
  if (cached) return cached

  const lines = calculateLines(text)
  const sizes = calculateWidthAndHeight(lines, typeof text === 'string')

  if (isImage) {
    sizes.width = 80
    sizes.height = 80
  }

  if (isParent) sizes.width += 80
  if (sizes.width > 700) sizes.width = 700

  sizeCache.set(cacheKey, sizes)
  return sizes
}
