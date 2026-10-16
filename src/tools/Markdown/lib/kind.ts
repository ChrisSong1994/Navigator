/**
 * Markdown 工具的「文件类型」参数，交给公共层的 pickTextFile / saveTextFile。
 *
 * 单独放一个模块是因为两处都要用：主界面（导入 / 保存）和编辑器容器上的拖拽落点 ——
 * 而主界面不能反过来被组件引用（会成环）。
 */
import type { TextFileKind } from '../../lib/file.ts'

export const MARKDOWN_FILE_KIND: TextFileKind = {
  accept: '.md,.markdown,.mdown,.txt,text/markdown,text/plain',
  description: 'Markdown 文件',
  mime: 'text/markdown',
  extension: '.md',
}
