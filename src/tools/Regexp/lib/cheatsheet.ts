/**
 * 正则语法速查表的数据。从上游 pages/Regexp/CheatSheet.tsx 搬来，**数据修过**：
 *
 * 上游那张表在搬运过程中把转义弄丢了 —— `\\d` 写成 `d`、`\\w` 写成 `[A - Za - z0 - 9_]`、
 * `</?[ws]*>` 少了两个反斜杠。照着抄出来的正则全是错的，这里逐条改回去。
 *
 * 数据放在 lib 里而不是组件文件里：`pnpm check:tools` 要能断言「没再丢转义」，
 * 组件文件里混着常量会触发 fast-refresh 的 only-export-components 警告。
 */

export interface CheatSheetRow {
  syntax: string
  description: string
}

/** 语法速查 */
export const DATASOURCE: CheatSheetRow[] = [
  { syntax: '.', description: '除换行符以外的所有字符。' },
  { syntax: '^', description: '字符串开头。' },
  { syntax: '$', description: '字符串结尾。' },
  { syntax: '*', description: '匹配前面的子表达式零次或多次。' },
  { syntax: '+', description: '匹配前面的子表达式一次或多次。' },
  { syntax: '?', description: '匹配前面的子表达式零次或一次。' },
  { syntax: '{n}', description: '匹配确定的 n 次。' },
  { syntax: '{n,}', description: '至少匹配 n 次。' },
  { syntax: '{n,m}', description: '匹配最少 n 次且最多 m 次。' },
  { syntax: '[ ]', description: '字符集合，匹配方括号中的任意一个字符。' },
  { syntax: '[^ ]', description: '否定字符集合，匹配除方括号中的字符以外的任意字符。' },
  { syntax: '( )', description: '分组，将括号内的内容作为一个整体，可以用于反向引用等。' },
  { syntax: '(?: )', description: '非捕获分组，只分组不占编号，不影响 $1 / $2 的顺序。' },
  { syntax: '(?<name> )', description: '命名分组，可以用 $<name> 反向引用或在替换里取用。' },
  { syntax: '|', description: '或，匹配前面的或后面的子表达式。' },
  { syntax: '\\', description: '转义字符，用于匹配特殊字符。' },
  { syntax: '\\d', description: '匹配一个数字字符，等效于 [0-9]。' },
  { syntax: '\\D', description: '匹配一个非数字字符，等效于 [^0-9]。' },
  { syntax: '\\w', description: '匹配字母、数字或下划线，等效于 [A-Za-z0-9_]。' },
  { syntax: '\\W', description: '匹配非字母、数字和下划线的字符，等效于 [^A-Za-z0-9_]。' },
  {
    syntax: '\\s',
    description: '匹配任何空白字符，包括空格、制表符、换页符等，等效于 [ \\f\\n\\r\\t\\v]。',
  },
  { syntax: '\\S', description: '匹配任何非空白字符，等效于 [^ \\f\\n\\r\\t\\v]。' },
  { syntax: '\\b', description: '单词边界，只匹配位置不消耗字符。' },
  { syntax: '(?=pattern)', description: '正向肯定预查，匹配后面跟着指定模式 pattern 的位置。' },
  { syntax: '(?!pattern)', description: '正向否定预查，匹配后面不跟着指定模式 pattern 的位置。' },
  { syntax: '(?<=pattern)', description: '反向肯定预查，匹配前面是指定模式 pattern 的位置。' },
  { syntax: '(?<!pattern)', description: '反向否定预查，匹配前面不是指定模式 pattern 的位置。' },
]

/** 常用示例 */
export const EXAMPLE_DATASOURCE: CheatSheetRow[] = [
  { description: '正整数', syntax: '^\\d+$' },
  { description: '英文和数字', syntax: '^[a-zA-Z0-9]+$' },
  {
    description: '日期（YYYY-MM-dd）',
    syntax: '^([12]\\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01]))$',
  },
  { description: '手机号', syntax: '^(?:\\+?86)?1[3-9]\\d{9}$' },
  { description: '邮政编码', syntax: '^[0-9]{6}$' },
  {
    description: '身份证号码（2 代）',
    syntax:
      '^[1-9]\\d{5}(18|19|20)\\d{2}((0[1-9])|(1[0-2]))(([0-2][1-9])|10|20|30|31)\\d{3}[0-9Xx]$',
  },
  {
    description: '电子邮箱',
    syntax: '^([a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,6})*$',
  },
  {
    description: 'URL',
    syntax:
      '^https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._\\+~#=]{2,256}\\.[a-z]{2,6}\\b([-a-zA-Z0-9@:%_\\+.~#()?&//=]*)$',
  },
  { description: 'HTML 标签', syntax: '</?[\\w\\s]*>' },
  { description: '中文字符', syntax: '[\\u4e00-\\u9fa5]+' },
]