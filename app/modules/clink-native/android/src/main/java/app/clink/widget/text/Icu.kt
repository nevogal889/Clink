package app.clink.widget.text

// Kotlin port of packages/shared/src/strings/icu.ts: the ICU MessageFormat subset COPY.md uses.
//   {name}                                             simple argument
//   {n, plural, =0 {…} one {# drink} other {# drinks}}  plural, exact matches and #
//   {k, select, a {…} other {…}}                       select
// Apostrophes are literal text (COPY.md never quotes braces). English plural rule: 1 is "one".

sealed class IcuNode {
  data class Text(val value: String) : IcuNode()

  data class Arg(val name: String) : IcuNode()

  data object Pound : IcuNode()

  data class Plural(val name: String, val branches: Map<String, List<IcuNode>>) : IcuNode()

  data class Select(val name: String, val branches: Map<String, List<IcuNode>>) : IcuNode()
}

class IcuException(message: String) : IllegalArgumentException(message)

object Icu {
  fun parse(message: String): List<IcuNode> = parseNodes(message, false)

  private fun parseNodes(msg: String, inPlural: Boolean): List<IcuNode> {
    val nodes = mutableListOf<IcuNode>()
    val text = StringBuilder()
    fun flush() {
      if (text.isNotEmpty()) nodes.add(IcuNode.Text(text.toString()))
      text.setLength(0)
    }
    var i = 0
    while (i < msg.length) {
      val ch = msg[i]
      when {
        ch == '{' -> {
          flush()
          val end = matchBrace(msg, i)
          nodes.add(parseArg(msg.substring(i + 1, end)))
          i = end + 1
        }
        ch == '}' -> throw IcuException("Unbalanced \"}\" in: $msg")
        ch == '#' && inPlural -> {
          flush()
          nodes.add(IcuNode.Pound)
          i++
        }
        else -> {
          text.append(ch)
          i++
        }
      }
    }
    flush()
    return nodes
  }

  private fun parseArg(inner: String): IcuNode {
    val comma = inner.indexOf(',')
    if (comma == -1) {
      val name = inner.trim()
      if (name.isEmpty()) throw IcuException("Empty ICU argument")
      return IcuNode.Arg(name)
    }
    val name = inner.substring(0, comma).trim()
    val rest = inner.substring(comma + 1)
    val comma2 = rest.indexOf(',')
    val kind = (if (comma2 == -1) rest else rest.substring(0, comma2)).trim()
    if (kind != "plural" && kind != "select") {
      throw IcuException("Unsupported ICU argument type \"$kind\" for {$name}")
    }
    val body = rest.substring(comma2 + 1)
    val branches = LinkedHashMap<String, List<IcuNode>>()
    var k = 0
    while (k < body.length) {
      while (k < body.length && body[k].isWhitespace()) k++
      if (k >= body.length) break
      val sel = StringBuilder()
      while (k < body.length && body[k] != '{' && !body[k].isWhitespace()) sel.append(body[k++])
      while (k < body.length && body[k].isWhitespace()) k++
      if (k >= body.length || body[k] != '{') {
        throw IcuException("ICU branch \"$sel\" of {$name} has no message")
      }
      val end = matchBrace(body, k)
      branches[sel.toString()] = parseNodes(body.substring(k + 1, end), kind == "plural")
      k = end + 1
    }
    if ("other" !in branches) throw IcuException("ICU {$name, $kind} has no \"other\" branch")
    return if (kind == "plural") IcuNode.Plural(name, branches) else IcuNode.Select(name, branches)
  }

  private fun matchBrace(s: String, open: Int): Int {
    var depth = 0
    for (i in open until s.length) {
      if (s[i] == '{') depth++
      else if (s[i] == '}') {
        depth--
        if (depth == 0) return i
      }
    }
    throw IcuException("Unbalanced \"{\" in: $s")
  }

  fun pluralCategory(n: Long): String = if (n == 1L) "one" else "other"

  fun format(nodes: List<IcuNode>, vars: Map<String, Any>, pound: Long? = null): String {
    val out = StringBuilder()
    for (n in nodes) {
      when (n) {
        is IcuNode.Text -> out.append(n.value)
        is IcuNode.Pound -> out.append(pound?.toString() ?: "#")
        is IcuNode.Arg -> out.append(need(vars, n.name).toString())
        is IcuNode.Plural -> {
          val v = need(vars, n.name)
          val value = (v as? Number)?.toLong() ?: throw IcuException("{${n.name}} must be a number")
          val branch = n.branches["=$value"] ?: n.branches[pluralCategory(value)] ?: n.branches["other"]
          out.append(format(branch ?: emptyList(), vars, value))
        }
        is IcuNode.Select -> {
          val value = need(vars, n.name).toString()
          out.append(format(n.branches[value] ?: n.branches["other"] ?: emptyList(), vars, pound))
        }
      }
    }
    return out.toString()
  }

  private fun need(vars: Map<String, Any>, name: String): Any =
    vars[name] ?: throw IcuException("Missing string variable {$name}")

  /** t(): format, collapse runs of spaces, trim (packages/shared/src/strings t()). */
  fun render(message: String, vars: Map<String, Any> = emptyMap()): String =
    format(parse(message), vars).replace(Regex(" {2,}"), " ").trim()
}
