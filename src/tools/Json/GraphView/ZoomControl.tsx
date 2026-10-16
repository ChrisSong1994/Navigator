import React from 'react'
import { Button, Flex, Input } from 'antd'
import {
  AimOutlined,
  ExpandOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons'

import useGraph from './stores/useGraph.ts'
import { useFocusNode } from './hooks/useFocusNode.ts'

/**
 * 画布左下角的浮层：几个视口按钮 + 节点搜索。
 * 搬自 developer-assistant 的 GraphView/ZoomControl.tsx。原文件用的是 Mantine 的
 * useHotkeys / getHotkeyHandler，这里换成原生 keydown；原文件里还有个导出图片的按钮，
 * 但它整块 JSX 都是注释掉的（html-to-image + Electron 存盘），就没有搬。
 */
export const ZoomControl = () => {
  const zoomIn = useGraph((state) => state.zoomIn)
  const zoomOut = useGraph((state) => state.zoomOut)
  const centerView = useGraph((state) => state.centerView)
  const focusFirstNode = useGraph((state) => state.focusFirstNode)
  const [searchValue, setValue, skip, nodeCount, currentNode] = useFocusNode()

  // 快捷键（原项目是 mod+[plus] / mod+[minus] / shift+Digit1 / shift+Digit2，按物理键算）。
  // 原文件写的是 ['mod+[plus]', () => zoomIn]，传进去的是函数本身而不是调用，等于没接上，这里接上。
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey

      if (mod && event.code === 'Equal') {
        event.preventDefault()
        zoomIn()
      } else if (mod && event.code === 'Minus') {
        event.preventDefault()
        zoomOut()
      } else if (event.shiftKey && event.code === 'Digit1') {
        centerView()
      } else if (event.shiftKey && event.code === 'Digit2') {
        focusFirstNode()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [zoomIn, zoomOut, centerView, focusFirstNode])

  return (
    <Flex
      gap="small"
      style={{
        position: 'absolute',
        bottom: '10px',
        left: '10px',
        alignItems: 'start',
        zIndex: 100,
      }}
    >
      <Flex gap="small" align="center">
        <Button icon={<AimOutlined />} title="定位到根节点" onClick={focusFirstNode} />
        <Button icon={<ExpandOutlined />} title="居中显示" onClick={centerView} />
        <Button icon={<ZoomOutOutlined />} title="缩小" onClick={zoomOut} />
        <Button icon={<ZoomInOutlined />} title="放大" onClick={zoomIn} />
      </Flex>

      <Input
        placeholder="搜索节点"
        variant="underlined"
        value={searchValue}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') skip()
        }}
        // 计数一直挂在 suffix 上，只是没搜索时为空 —— 让 suffix 一下有一阵没有，antd 会把焦点抖掉
        suffix={
          <span>
            {searchValue ? `${nodeCount}/${nodeCount > 0 ? currentNode + 1 : '0'}` : ''}
          </span>
        }
      />
    </Flex>
  )
}
