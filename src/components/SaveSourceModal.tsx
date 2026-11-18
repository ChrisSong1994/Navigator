import { Button, Modal } from 'antd'

import './SaveSourceModal.css'

export interface SaveSourceModalProps {
  /** 源文件地址（`file://…`） */
  url: string
  /** 手上是不是已经记着这份文件的句柄：有就直接写，没有要先过一次系统保存框 */
  cached: boolean
  onWriteBack: () => void
  onSaveAs: () => void
  onCancel: () => void
}

/**
 * 保存一份来自本地文件的内容时，先问一句写不写回源文件。Markdown 与 JSON 共用。
 *
 * 之所以不能像桌面编辑器那样直接存（连问都不问）：浏览器不给扩展文件路径，写回要用户在
 * 系统保存框里亲自选定那个文件，所以第一次必然会多一个框，得先跟用户说清楚（见 lib/writeBack.ts）。
 *
 * 按钮走 footer 而不是 okText / cancelText：这里有两个同级的「下一步」，
 * okText 表达不了，而且「写回源文件」才该是主按钮。
 */
export function SaveSourceModal({
  url,
  cached,
  onWriteBack,
  onSaveAs,
  onCancel,
}: SaveSourceModalProps) {
  return (
    <Modal
      open
      width={460}
      title="这份内容来自本地文件"
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button key="save-as" onClick={onSaveAs}>
          另存为…
        </Button>,
        <Button key="write-back" type="primary" onClick={onWriteBack}>
          写回源文件
        </Button>,
      ]}
    >
      <p className="save-source-text">要把改动写回它吗？</p>
      <code className="save-source-path">{url}</code>
      <p className="save-source-hint">
        {cached
          ? '已经记住这个文件了，「写回源文件」会直接写进去。想存到别处就用「另存为…」。'
          : '浏览器不让扩展直接写本地文件，第一次要在系统保存框里选定它（文件名已经填好，保存框会尽量开在源文件所在的目录），选定之后就直接写了。'}
      </p>
    </Modal>
  )
}
