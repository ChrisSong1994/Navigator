/**
 * Kotlin 源码 → Java 源码。上游 `JsonToJava.tsx` 里那段「先让 json_typegen 出 Kotlin，再按行重写成 Java」的
 * 逻辑，抽成纯函数：这样它是可测的（scripts/check-tools.mjs 钉住），也不必为了测它去起 WASM。
 *
 * 上游那套重写是**按硬编码下标切字符串**（`substring(11, indexOf('('))`、`substring(indexOf(':') + 2, len - 1)`），
 * 脆得很，但行为照抄 —— 它对自己的输出是对的，改写的风险比留着大。唯一补的是：上游在外面套了个
 * `try/catch` 只 return 空串，这里让错误抛出去，由调用方统一决定怎么提示。
 */

/** 一行 `val name: type,` → `private type name;`，同时把类型与变量名记下来给后面生成构造函数/读写器 */
interface KotlinField {
  name: string
  type: string
}

/** Kotlin 的 `List<Any>?` → Java 的 `List<?>` */
function toJavaType(kotlinType: string): string {
  return kotlinType.replace('<Any>?', '<?>').replace('<Any>', '<?>')
}

function titleCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.substring(1)
}

/** 一类收尾时补上构造函数与 getter / setter，再关掉花括号 */
function closeClass(className: string, fields: KotlinField[]): string {
  const args = fields.map((field) => `${field.type} ${field.name}`)
  const getters = fields.map(
    (field) =>
      `\tpublic ${field.type} get${titleCase(field.name)}() {\n\t\treturn this.${field.name};\n\t}\n`,
  )
  const setters = fields.map(
    (field) =>
      `\tpublic void set${titleCase(field.name)}(${field.type} ${field.name}) {\n\t\tthis.${field.name} = ${field.name};\n\t}\n`,
  )
  const assignments = fields.map((field) => `this.${field.name} = ${field.name};`).join('\n\t\t')
  const constructor = `\tpublic ${className}(${args.join(', ')}) {\n\t\t${assignments}\n\t}\n`

  return `\n${constructor}\n${getters.join('\n')}\n${setters.join('\n')}}`
}

/** `val name: String?,` → `private String name;` */
function toJavaField(line: string): { code: string; field: KotlinField } {
  const processed = line.replace('?', '')
  const name = processed.substring(4, processed.indexOf(':'))
  const type = toJavaType(processed.substring(processed.indexOf(':') + 2, processed.length - 1))
  return { code: `\tprivate ${type} ${name};`, field: { name, type } }
}

/** `typealias Root = List<RootItem>?` → 一个只装一个字段的类（上游就是这么做的） */
function typealiasToClass(line: string): string {
  const className = line.substring(10, line.indexOf(' ='))
  const type = toJavaType(line.substring(line.indexOf('=') + 2, line.length - 1))
  const variable = className.charAt(0).toLowerCase() + className.substring(1)

  const constructor = `\tpublic ${className}(${type} ${variable}) {\n\t\tthis.${variable} = ${variable};\n\t}\n`
  const getter = `\tpublic ${type} get${className}() {\n\t\treturn this.${variable};\n\t}\n\n`
  const setter = `\tpublic void set${className}(${type} ${variable}) {\n\t\tthis.${variable} = ${variable};\n\t}\n\n`

  return (
    `public class ${className} {\n\tprivate ${type} ${variable};\n` +
    `\n${constructor}\n${getter}${setter}}`
  )
}

export function kotlinToJava(kotlin: string): string {
  let java = ''
  let currentClass = ''
  let fields: KotlinField[] = []

  for (const originalLine of kotlin.split('\n')) {
    const line = originalLine.trim()

    if (line === ')') {
      // 类收尾：补构造函数 / getter / setter，然后清掉累积状态
      java += closeClass(currentClass, fields)
      currentClass = ''
      fields = []
    } else if (line.startsWith('data class ')) {
      // `data class Root(` → `public class Root {`
      currentClass = line.substring(11, line.indexOf('('))
      java += `public class ${currentClass} {`
    } else if (line.startsWith('val')) {
      const { code, field } = toJavaField(line)
      fields.push(field)
      java += code
    } else if (line.startsWith('typealias')) {
      java += typealiasToClass(line)
    } else if (line.startsWith('import')) {
      java += `${line};`
    } else {
      // 其余多半是空行，按原样接上（含原来的缩进）
      java += originalLine
    }

    java += '\n'
  }

  return java
}
