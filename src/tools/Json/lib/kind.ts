/**
 * JSON 工具的「文件类型」参数，交给公共层的 pickTextFile / saveTextFile。
 *
 * 单独放一个模块是因为三处都要用：主界面（导入 / 保存）和编辑器里的空态提示、
 * 报错面板的导入按钮 —— 而主界面不能反过来被组件引用（会成环）。
 */
import type { TextFileKind } from '../../lib/file.ts'

export const JSON_FILE_KIND: TextFileKind = {
  accept: '.json,.json5,application/json,text/plain',
  description: 'JSON 文件',
  mime: 'application/json',
  extension: '.json',
}
