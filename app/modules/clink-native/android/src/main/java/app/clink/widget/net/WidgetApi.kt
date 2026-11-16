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
      val result = classify(code)
      val json = text?.let { runCatching { JSONObject(it) }.getOrNull() }
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

    /** WIDGET_API_ERRORS: 401 re-auth, 403/429/5xx retry, every other 4xx (409 included) drop. */
    fun classify(code: Int): SendResult =
      when {
        code in 200..299 -> SendResult.Accepted
        code == 401 -> SendResult.Unauthorized
        code == 403 || code == 408 || code == 429 || code >= 500 -> SendResult.RetryLater
        code in 400..499 -> SendResult.Rejected(code)
        else -> SendResult.RetryLater
      }
  }
}
