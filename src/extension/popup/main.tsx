import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'antd/dist/reset.css'
import '../../index.css'
import { Popup } from './Popup.tsx'

// 弹窗整块都是内容，不留首页那种画布底色（见 index.css 里的 body.spirit-popup）
// html 也标记上，用来覆盖首页 html/body 的 min-height: 100%
document.documentElement.classList.add('spirit-popup')
document.body.classList.add('spirit-popup')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
)
