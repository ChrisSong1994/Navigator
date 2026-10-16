import { useEffect, useState } from 'react'
import { Button } from 'antd'
import { FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons'

/**
 * 右上角的「全屏看这张图」。
 * 搬自 developer-assistant 的 GraphView/ScreenAction.tsx（原文件用的是项目自己的 iconfont）。
 * 原文件只在自己点按钮时记状态，按 Esc 退出全屏按钮就错位了，这里补一个 fullscreenchange 监听。
 */
const ScreenAction = () => {
  const [isFullScreen, setIsFullScreen] = useState(false)

  useEffect(() => {
    const onChange = () => setIsFullScreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    onChange()
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullScreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }

    const graph = document.getElementById('jsongraph')
    void graph?.requestFullscreen()
  }

  return (
    <div
      className="screen-action"
      style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        alignItems: 'start',
        zIndex: 100,
      }}
    >
      <Button
        icon={isFullScreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
        title={isFullScreen ? '退出全屏' : '全屏'}
        onClick={toggleFullScreen}
      />
    </div>
  )
}

export default ScreenAction
