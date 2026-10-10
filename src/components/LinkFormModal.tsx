import { Form, Input, Modal } from 'antd'
import { useConfig } from '../config/configContext.ts'
import type { NavLink } from '../config/schema.ts'
import { LinkIcon } from './LinkIcon.tsx'

interface LinkFormModalProps {
  groupId: string
  groupTitle: string
  /** 传了就是编辑，没传就是新增 */
  link?: NavLink
  onClose: () => void
}

/** 新增 / 编辑链接的弹窗，预览区和配置面板共用 */
export function LinkFormModal({ groupId, groupTitle, link, onClose }: LinkFormModalProps) {
  const { addLink, updateLink } = useConfig()
  const [form] = Form.useForm<NavLink>()
  const editing = link !== undefined
  const iconPreview = (Form.useWatch('icon', form) as string | undefined) ?? ''
  const textPreview = (Form.useWatch('text', form) as string | undefined) ?? ''

  return (
    <Modal
      open
      width={440}
      title={`${editing ? '编辑链接' : '新增链接'} · ${groupTitle}`}
      okText={editing ? '保存' : '添加'}
      cancelText="取消"
      onCancel={onClose}
      afterClose={() => form.resetFields()}
      onOk={async () => {
        const values = await form.validateFields()
        const patch: NavLink = {
          text: values.text.trim(),
          href: values.href.trim(),
          icon: values.icon?.trim() ?? '',
        }
        if (editing) updateLink(groupId, link.href, patch)
        else addLink(groupId, patch)
        onClose()
      }}
    >
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ icon: '', ...link }}>
        <Form.Item name="text" label="名称" rules={[{ required: true, message: '请填写名称' }]}>
          <Input placeholder="例如 GitHub" />
        </Form.Item>
        <Form.Item name="href" label="地址" rules={[{ required: true, message: '请填写地址' }]}>
          <Input placeholder="https://github.com/" />
        </Form.Item>
        <Form.Item
          name="icon"
          label="图标（选填）"
          extra="支持 base64 data URL 或图片地址，留空则用首字母色块"
          className="!mb-0"
        >
          <Input
            placeholder="data:image/png;base64,…"
            prefix={<LinkIcon link={{ icon: iconPreview, href: '', text: textPreview }} size={16} />}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
