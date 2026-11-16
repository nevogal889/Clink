package app.clink.widget.net

import app.clink.widget.model.OutboxEntry
import app.clink.widget.model.SendResult
import app.clink.widget.model.Timers
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import org.json.JSONObject

// widget-api over HTTPS (ARCHITECTURE.md 3.2, 4.4; contract in docs/build-notes/widget-backend.md
// and packages/shared/src/api: widgetStateQuery, widgetLogInput, widgetLogResponse,
// WIDGET_API_ERRORS). Auth is the widget token only: "Authorization: Bearer <widget token>", plus
// the x-region header so the function runs next to the database. 8 s timeout on every call. The
// token and the bodies are never logged.
//   GET  {functions}/widget-api/state?instance=&size=&tz=  -> the widget-state JSON
//   POST {functions}/widget-api/log  {id, drinkId, slot, category, loggedAt, timeZone}
//        -> {status: "logged" | "duplicate", id, today}

data class StateQuery(val instance: String? = null, val size: String? = null, val tz: String? = null)

interface WidgetApi {
  fun postLog(token: String, entry: OutboxEntry.Log, timeZone: String): LogResult

  fun getState(token: String, query: StateQuery): StateResult
}

data class LogResult(
  val result: SendResult,
  /** The `today` object of a 200 answer (widgetTodaySchema), as JSON. */
  val todayJson: String? = null,
  /** Seconds from a 429 `retryAfter`. */
  val retryAfterSec: Long? = null,
)

enum class ErrorAction { REAUTH, RETRY, REJECT }

/** WIDGET_API_ERRORS `kind`: why the server refused. */
enum class ErrorKind(val key: String) {
  RETRYABLE("retryable"),
  MALFORMED("malformed"),
  STALE("stale"),
}

data class ErrorRule(val status: Int, val action: ErrorAction, val kind: ErrorKind)

/**
 * Port of WIDGET_API_ERRORS (packages/shared/src/api): what the widget does with each error code.
 * "drop" there is REJECT here: a log is never deleted, it moves to the rejected list with its code
 * and kind for the app to report. SyncTest compares this table with the shared one.
 */
object WidgetApiErrors {
  val TABLE: Map<String, ErrorRule> =
    mapOf(
      "unauthorized" to ErrorRule(401, ErrorAction.REAUTH, ErrorKind.RETRYABLE),
      "suspended" to ErrorRule(403, ErrorAction.RETRY, ErrorKind.RETRYABLE),
      "rate_limited" to ErrorRule(429, ErrorAction.RETRY, ErrorKind.RETRYABLE),
      "internal" to ErrorRule(500, ErrorAction.RETRY, ErrorKind.RETRYABLE),
      "bad_input" to ErrorRule(400, ErrorAction.REJECT, ErrorKind.MALFORMED),
      "unknown_drink" to ErrorRule(422, ErrorAction.REJECT, ErrorKind.MALFORMED),
      "conflict" to ErrorRule(409, ErrorAction.REJECT, ErrorKind.MALFORMED),
      "not_found" to ErrorRule(404, ErrorAction.REJECT, ErrorKind.MALFORMED),
      "method_not_allowed" to ErrorRule(405, ErrorAction.REJECT, ErrorKind.MALFORMED),
      "too_large" to ErrorRule(413, ErrorAction.REJECT, ErrorKind.MALFORMED),
      "usual_changed" to ErrorRule(409, ErrorAction.REJECT, ErrorKind.STALE),
    )
}

sealed class StateResult {
  data class Ok(val json: String) : StateResult()

  data object Unauthorized : StateResult()

  data object Failed : StateResult()
}

class HttpWidgetApi(private val functionsUrl: String, private val region: String?) : WidgetApi {
  private fun open(pathAndQuery: String, token: String, method: String): HttpURLConnection {
    val c = URL("${functionsUrl.trimEnd('/')}/widget-api/$pathAndQuery").openConnection() as HttpURLConnection
    val timeout = (Timers.WIDGET_CALL_TIMEOUT_SEC * 1000).toInt()
    c.connectTimeout = timeout
    c.readTimeout = timeout
    c.requestMethod = method
    c.instanceFollowRedirects = false
    c.useCaches = false
    c.setRequestProperty("Authorization", "Bearer $token")
    c.setRequestProperty("Accept", "application/json")
    region?.let { c.setRequestProperty("x-region", it) }
    return c
  }

  override fun postLog(token: String, entry: OutboxEntry.Log, timeZone: String): LogResult {
    val body = logBody(entry, timeZone)
    return try {
      val c = open("log", token, "POST")
      c.doOutput = true
      c.setRequestProperty("Content-Type", "application/json")
      c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
      val code = c.responseCode
      val text = read(c)
      val json = text?.let { runCatching { JSONObject(it) }.getOrNull() }
      val result = classify(code, json?.optString("error")?.takeIf { it.isNotEmpty() })
      LogResult(
        result,
        todayJson = if (result == SendResult.Accepted) json?.optJSONObject("today")?.toString() else null,
        retryAfterSec = if (code == 429) json?.optLong("retryAfter")?.takeIf { it > 0 } else null,
      )
    } catch (e: IOException) {
      LogResult(SendResult.RetryLater)
    }
  }

  override fun getState(token: String, query: StateQuery): StateResult =
    try {
      val c = open("state" + queryString(query), token, "GET")
      val code = c.responseCode
      val text = read(c)
      when {
        code in 200..299 && text != null -> StateResult.Ok(text)
        code == 401 -> StateResult.Unauthorized
        else -> StateResult.Failed
      }
    } catch (e: IOException) {
      StateResult.Failed
    }

  private fun read(c: HttpURLConnection): String? =
    try {
      (if (c.responseCode in 200..299) c.inputStream else c.errorStream)?.use {
        it.readBytes().toString(Charsets.UTF_8)
      }
    } catch (e: IOException) {
      null
    } finally {
      c.disconnect()
    }

  companion object {
    /** widgetLogInput: every key present, nulls included (the schema is strict). */
    fun logBody(entry: OutboxEntry.Log, timeZone: String): JSONObject {
      val p = entry.payload
      return JSONObject()
        .put("id", entry.id)
        .put("drinkId", p.drinkId ?: JSONObject.NULL)
        .put("slot", p.slot ?: JSONObject.NULL)
        .put("category", p.category.key)
        .put("loggedAt", p.loggedAt.toString())
        .put("timeZone", timeZone)
    }

    fun queryString(q: StateQuery): String {
      val parts =
        listOfNotNull(
          q.instance?.let { "instance=" + enc(it) },
          q.size?.let { "size=" + enc(it) },
          q.tz?.let { "tz=" + enc(it) },
        )
      return if (parts.isEmpty()) "" else "?" + parts.joinToString("&")
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    /**
     * widgetApiAction() in packages/shared/src/api: by the answer's `error` code when the table
     * lists it ("reauth", "retry": kept and retried with backoff, "drop": a log moves to `rejected`,
     * never deleted), else by status: 401 re-auth; 403, 408, 429 and 5xx retry; any other 4xx is
     * rejected.
     */
    fun classify(status: Int, code: String? = null): SendResult {
      if (status in 200..299) return SendResult.Accepted
      val rule = code?.let { WidgetApiErrors.TABLE[it] }
      if (rule == null && status == 401) return SendResult.Unauthorized
      return when (rule?.action) {
        ErrorAction.REAUTH -> SendResult.Unauthorized
        ErrorAction.RETRY -> SendResult.RetryLater
        ErrorAction.REJECT -> SendResult.Rejected(status, code, rule.kind.key)
        null ->
          when {
            status == 403 || status == 408 || status == 429 || status >= 500 -> SendResult.RetryLater
            status in 400..499 -> SendResult.Rejected(status, code)
            else -> SendResult.RetryLater
          }
      }
    }
  }
}
