/**
 * Markdown 工具的「文件类型」参数，交给公共层的 pickTextFile / saveTextFile。
 *
 * 单独放一个模块是因为主界面不能反过来被组件引用（会成环），而三处都要用：
 * 工具栏的导入 / 保存、演示模式空态的上传按钮、整窗拖入时的文件判定。
 *
 * 「什么算 Markdown」的判定和后缀表在公共层（lib/markdown.ts）：首页拖入也要用，
 * 而首页不能 import 工具的 lib。这里的 accept 串由那份后缀表拼出来，只有一份、不会漂。
 */
import type { TextFileKind } from '../../../lib/file.ts'
import { MARKDOWN_EXTENSIONS } from '../../../lib/markdown.ts'

export const MARKDOWN_FILE_KIND: TextFileKind = {
  accept: MARKDOWN_EXTENSIONS.join(','),
  description: 'Markdown 文件',
  mime: 'text/markdown',
  extension: '.md',
}
