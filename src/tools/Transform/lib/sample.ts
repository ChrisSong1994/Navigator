/**
 * 三个转换器的示例内容，照抄上游各组件里的 DEFAULT_VALUE。
 * 上游把它们散在 10 个文件里各写一份（内容其实只有这三份），这里收成一处。
 */

/** 结构最全的那份：7 个以 JSON 为输入的转换器都用它（上游 name: "fett" 那份） */
export const SAMPLE_JSON = `{
  "name": "fett",
  "age": 18,
  "isStudent": true,
  "hobbies": [
    "reading",
    "swimming",
    "programming"
  ],
  "address": {
    "city": "Shanghai",
    "country": "China"
  }
}`

/** YAML 转 JSON 的输入（上游开头那个空行也留着，读起来更接近原样） */
export const SAMPLE_YAML = `
name: fett
age: 18
isStudent: true
hobbies:
  - reading
  - swimming
  - programming
address:
  city: Shanghai
  country: China
`

/** 两个 JS Object 转换器的输入：上游那份 mongoose schema（单引号、无引号键都没有，但有尾逗号与换行） */
export const SAMPLE_JS_OBJECT = `{
	title: {
		type: 'String',
		trim: true,
		index: true,
		required: true
	},
	year: {
		type: 'Number',
		max: 2012,
		validate: 'validateBookYear'
	},
	author: {
		type: 'ObjectId',
		ref: 'Author',
		index: true,
		required: true
	}
}`
