package app.clink.widget.ui

import app.clink.nativemodule.R
import app.clink.widget.AppRoute
import app.clink.widget.model.Confirmation
import app.clink.widget.model.ConfirmationKind
import app.clink.widget.model.IncomingFlare
import app.clink.widget.model.LogCategory
import app.clink.widget.model.MyResponse
import app.clink.widget.model.Overlay
import app.clink.widget.model.Reply
import app.clink.widget.model.Resolve
import app.clink.widget.model.WidgetConfig
import app.clink.widget.model.WidgetLocal
import app.clink.widget.model.WidgetSize
import app.clink.widget.model.WidgetState
import app.clink.widget.model.WidgetView
import app.clink.widget.text.Copy
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

// Builds the WidgetModel for one widget from the (optimistic) state, its local state and config.
// Layouts and wording: DESIGN.md 5.1 to 5.3 and 5.6, COPY.md 4.26, 4.27 and 6.

class ModelBuilder(private val copy: Copy) {
  companion object {
    /** Widget text never grows past this multiple of its size (DESIGN.md 2.4: numeral.l 1.35x). */
    const val MAX_TEXT_SCALE = 1.3f
    const val COMPACT_FONT_SCALE = 1.3f

    fun layoutFor(widthDp: Float, heightDp: Float): Layout =
      when {
        // Widgets under 230 dp wide use the small layout (DESIGN.md 5.5).
        widthDp < 230f -> if (heightDp >= 150f) Layout.SMALL_TALL else Layout.SMALL
        heightDp < 150f -> Layout.MEDIUM_SHORT
        else -> Layout.MEDIUM
      }

    fun textScale(fontScale: Float): Float =
      if (fontScale <= MAX_TEXT_SCALE) 1f else MAX_TEXT_SCALE / fontScale

    private fun cap(s: String): String =
      s.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.US) else it.toString() }
  }

  fun build(
    state: WidgetState,
    local: WidgetLocal,
    config: WidgetConfig,
    layout: Layout,
    fontScale: Float,
    now: Instant,
    zone: ZoneId,
  ): WidgetModel {
    val sized = config.copy(size = if (layout.small) WidgetSize.SMALL else WidgetSize.MEDIUM)
    val view = Resolve.view(state, local, sized, now, zone)
    val ready = state as? WidgetState.Ready
    val compact = fontScale >= COMPACT_FONT_SCALE
    val scale = textScale(fontScale)
    val idleBg = R.drawable.clink_bg_widget_idle
    fun model(bg: Int, tap: Tap, content: Content) = WidgetModel(layout, scale, compact, bg, tap, content)
    val overlay = overlay(view.overlay, local.confirmation, layout)

    return when (view) {
      is WidgetView.SignedOut ->
        model(
          idleBg,
          Tap.Open(AppRoute.HOME),
          Content.Prompt(
            copy.t(if (layout.small) R.string.clink_ws_setup else R.string.clink_wm_signin),
            copy.t(R.string.clink_a11y_w_signin),
          ),
        )
      is WidgetView.Setup ->
        model(
          idleBg,
          Tap.Open(AppRoute.HOME),
          Content.Prompt(
            copy.t(if (layout.small) R.string.clink_ws_setup else R.string.clink_wm_setup),
            copy.t(R.string.clink_a11y_w_setup),
          ),
        )
      is WidgetView.Picker -> model(idleBg, Tap.Open(AppRoute.HOME), picker(ready!!, layout, overlay))
      is WidgetView.Idle -> model(idleBg, Tap.Open(AppRoute.HOME), idle(ready!!, view, sized, layout, now, zone, overlay))
      is WidgetView.MyFlareView -> myFlare(ready!!, layout, now, overlay).let { model(it.background, Tap.Open(AppRoute.HOME), it) }
      is WidgetView.Incoming -> incoming(ready!!, view, layout, now, overlay).let { model(it.background, Tap.Open(AppRoute.HOME), it) }
      is WidgetView.BringPicker -> bringPicker(ready!!, view, overlay).let { model(it.background, Tap.Open(AppRoute.HOME), it) }
    }
  }

  // -------------------------------------------------------------------------------------------

  private fun overlay(o: Overlay?, c: Confirmation?, layout: Layout): OverlayModel? {
    val small = layout.small
    return when (o) {
      null -> null
      is Overlay.Confirm -> {
        val text =
          when (o.kind) {
            ConfirmationKind.LOGGED -> copy.t(if (small) R.string.clink_ws_logged else R.string.clink_wm_logged)
            ConfirmationKind.SENT -> copy.t(R.string.clink_wm_sent)
            ConfirmationKind.IN -> copy.t(if (small) R.string.clink_ws_in_done else R.string.clink_wm_in_done_in)
            ConfirmationKind.ASKED ->
              copy.t(R.string.clink_wm_in_done_bring, "drink_short" to Copy.truncate(c?.drinkShort ?: "", Copy.DRINK_SHORT))
            ConfirmationKind.ENDED -> copy.t(if (small) R.string.clink_ws_ended else R.string.clink_wm_ended)
          }
        val detail = if (o.kind == ConfirmationKind.LOGGED) c?.drinkShort else null
        // a11y.w.confirm: the visible confirmation text ("Logged Flat White").
        OverlayModel.Confirm(text, detail, listOfNotNull(text, detail).joinToString(" "))
      }
      is Overlay.Sending -> {
        val text = copy.t(if (small) R.string.clink_ws_sending else R.string.clink_wm_sending)
        OverlayModel.Sending(text, text)
      }
      is Overlay.Failed ->
        OverlayModel.Failed(
          copy.t(if (small) R.string.clink_ws_failed else R.string.clink_wm_failed),
          o.opId,
          copy.t(R.string.clink_a11y_w_failed),
        )
    }
  }

  private fun minutesBetween(a: Instant, b: Instant): Long = Duration.between(a, b).toMinutes()

  private fun tracker(s: WidgetState.Ready, v: WidgetView.Idle, small: Boolean, now: Instant, zone: ZoneId): TrackerModel {
    val drinks = copy.t(R.string.clink_ws_drinks, "n" to v.drinks)
    val water = copy.t(R.string.clink_ws_water, "n" to v.water)
    val (dn, dw) = Copy.splitCount(drinks)
    val (wn, ww) = Copy.splitCount(water)
    // The last-drink line counts only today's drinks: after midnight it is gone with the counts.
    val last =
      s.today.lastDrinkAt?.takeIf {
        s.today.localDate == Resolve.localDateAt(now, zone) && Resolve.localDateAt(it, zone) == s.today.localDate
      }
    val agoMin = last?.let { maxOf(0L, minutesBetween(it, now)) }
    val lineKey = if (small) R.string.clink_ws_last else R.string.clink_wm_last
    val lastText =
      when {
        agoMin == null -> ""
        !small && agoMin < 1 -> copy.t(R.string.clink_wm_last_now)
        else -> copy.t(lineKey, "ago" to copy.ago(agoMin))
      }
    val a11y =
      if (last == null && v.drinks == 0 && v.water == 0) {
        copy.t(R.string.clink_a11y_w_tracker_none)
      } else if (agoMin != null) {
        copy.t(R.string.clink_a11y_w_tracker, "drinks" to v.drinks, "water" to v.water, "ago_words" to copy.words(agoMin))
      } else {
        // Counts but no drink today (water only): the counts, without a last-drink sentence.
        copy.t(R.string.clink_a11y_w_tracker, "drinks" to v.drinks, "water" to v.water, "ago_words" to "").substringBefore(". ") + "."
      }
    return TrackerModel(
      drinksNum = dn,
      drinksWord = dw,
      waterNum = wn,
      waterWord = ww,
      lastDrinkAt = last,
      lastFormat = copy.raw(lineKey).replace("{ago}", "%s"),
      lastText = lastText,
      noneText = copy.t(if (small) R.string.clink_ws_last_none else R.string.clink_wm_last_none),
      a11y = a11y,
    )
  }

  private fun audienceLabel(s: WidgetState.Ready, v: WidgetView.Idle): Pair<String, String> {
    val a = v.audience ?: return copy.t(R.string.clink_wm_group_everyone) to copy.t(R.string.clink_wm_group_everyone)
    val everyone = copy.t(R.string.clink_wm_group_everyone)
    val group = a.groupId?.let { id -> s.groups.firstOrNull { it.id == id } }
    return when (a.type) {
      "everyone" -> everyone to everyone
      "group" -> {
        val name = Copy.truncate(group?.name ?: "", Copy.GROUP)
        copy.t(R.string.clink_wm_group, "emoji" to (group?.emoji ?: ""), "group" to name) to (group?.name ?: "")
      }
      else -> {
        val name = group?.name?.let { Copy.truncate(it, Copy.GROUP) } ?: everyone
        copy.t(R.string.clink_wm_group_auto, "group" to name) to (group?.name ?: everyone)
      }
    }
  }

  private fun idle(
    s: WidgetState.Ready,
    v: WidgetView.Idle,
    config: WidgetConfig,
    layout: Layout,
    now: Instant,
    zone: ZoneId,
    overlay: OverlayModel?,
  ): Content.Idle {
    val small = layout.small
    val first = s.usual.firstOrNull()
    val usual =
      when {
        small -> null
        v.caffeineNote -> UsualLine(R.drawable.clink_glyph_tea_ink, copy.t(R.string.clink_wm_caff))
        first != null ->
          UsualLine(
            Res.icon(first.drinkId, LogCategory.of(first.category)),
            copy.t(R.string.clink_wm_usual, "drink_short" to Copy.truncate(first.drinkShort, Copy.DRINK_SHORT)),
          )
        else -> null
      }
    val snap =
      when {
        v.noFriends ->
          SnapTileModel.Invite(copy.t(R.string.clink_wm_nofriends), Tap.Open(AppRoute.SETTINGS), copy.t(R.string.clink_a11y_w_invite))
        v.snapId != null -> {
          val sn = s.snaps.first { it.id == v.snapId }
          val ago = maxOf(0L, minutesBetween(sn.createdAt, now))
          SnapTileModel.Photo(
            sn.thumbFile,
            copy.t(R.string.clink_wm_snap, "name" to Copy.truncate(sn.senderName, Copy.NAME), "ago" to copy.ago(ago)),
            Tap.Open(AppRoute.CAMERA),
            copy.t(R.string.clink_a11y_w_snap, "name" to sn.senderName, "ago_words" to copy.words(ago)),
          )
        }
        else -> SnapTileModel.Empty(copy.t(R.string.clink_wm_snap_none), Tap.Open(AppRoute.CAMERA))
      }
    val log =
      ButtonModel(
        label = copy.t(if (small) R.string.clink_ws_log else R.string.clink_wm_log),
        icon = R.drawable.clink_ui_plus,
        background = R.drawable.clink_bg_pill_tonal,
        textColor = R.color.clink_ink_primary,
        // No usual 3: +1 Drink opens the app on the usual 3 editor (PRD 3.3).
        tap = if (v.noUsual) Tap.Open(AppRoute.USUAL) else Tap.OpenPicker,
        a11y = copy.t(R.string.clink_a11y_w_log),
      )
    val camera =
      ButtonModel(
        label = copy.t(R.string.clink_wm_camera),
        icon = R.drawable.clink_ui_camera,
        background = R.drawable.clink_bg_pill_tonal,
        textColor = R.color.clink_ink_primary,
        tap = Tap.Open(AppRoute.CAMERA),
        a11y = copy.t(R.string.clink_a11y_w_camera),
      )
    val whoJoins =
      if (v.noFriends) {
        ButtonModel(
          label = copy.t(R.string.clink_wm_invite),
          icon = R.drawable.clink_ui_share_on_cobalt,
          background = R.drawable.clink_bg_pill_cobalt,
          textColor = R.color.clink_on_cobalt,
          tap = Tap.Open(AppRoute.SETTINGS),
          a11y = copy.t(R.string.clink_a11y_w_invite),
        )
      } else if (first == null) {
        // No usual 3: cobalt, opens the camera screen with the flare panel (DESIGN.md 5.2).
        val (label, spoken) = audienceLabel(s, v)
        ButtonModel(
          label = copy.t(R.string.clink_wm_flare),
          icon = null,
          background = R.drawable.clink_bg_pill_cobalt,
          textColor = R.color.clink_on_cobalt,
          tap = Tap.Open(AppRoute.CAMERA),
          a11y =
            copy.t(
              R.string.clink_a11y_w_flare,
              "cat" to copy.t(R.string.clink_cat_coffee).lowercase(Locale.US),
              "audience" to spoken,
              "mins" to copy.mins(0),
            ),
          subLabel = label,
        )
      } else {
        val r = Res.of(first.category)
        val (label, spoken) = audienceLabel(s, v)
        // M4 sends the quick flare from here; until then Who joins? opens the camera screen.
        ButtonModel(
          label = copy.t(R.string.clink_wm_flare),
          icon = r.glyphOnSolid,
          background = Res.flare(first.category).pillSolid,
          textColor = r.onSolid,
          tap = Tap.Open(if (v.audienceEmpty) AppRoute.SETTINGS else AppRoute.CAMERA),
          a11y =
            copy.t(
              R.string.clink_a11y_w_flare,
              "cat" to copy.t(r.word).lowercase(Locale.US),
              "audience" to spoken,
              "mins" to copy.mins(0),
            ),
          subLabel = label,
        )
      }
    return Content.Idle(tracker(s, v, small, now, zone), usual, snap, log, camera, whoJoins, overlay)
  }

  private fun picker(s: WidgetState.Ready, layout: Layout, overlay: OverlayModel?): Content.Picker {
    val small = layout.small
    val cells =
      s.usual.map { u ->
        PickerCell(
          icon = Res.icon(u.drinkId, LogCategory.of(u.category)),
          label = Copy.truncate(u.drinkShort, Copy.DRINK_SHORT),
          background = Res.of(u.category).cell,
          tap = Tap.Log(u.slot),
          a11y = copy.t(R.string.clink_a11y_w_pick, "drink" to u.name),
        )
      } +
        PickerCell(
          icon = DrinkIcons.iconS("water.still") ?: R.drawable.clink_glyph_water_ink,
          label = copy.t(if (small) R.string.clink_ws_pick_water else R.string.clink_wm_pick_water),
          background = R.drawable.clink_bg_cell_water,
          tap = Tap.Log(null),
          a11y = copy.t(R.string.clink_a11y_w_pick_water),
        )
    return Content.Picker(copy.t(R.string.clink_wm_pick_title), cells, copy.t(R.string.clink_a11y_w_close), overlay)
  }

  private fun repliesSpoken(replies: List<Reply>): String {
    if (replies.isEmpty()) return copy.t(R.string.clink_a11y_w_replies_none)
    val items =
      replies.take(3).map {
        when (it) {
          is Reply.In -> copy.t(R.string.clink_a11y_w_reply_in, "name" to it.name)
          is Reply.Bring -> copy.t(R.string.clink_a11y_w_reply_bring, "name" to it.name, "drink" to it.drinkShort)
        }
      }
    // COPY.md 4.26: up to three items joined with ", ", then "and {n} more" (no key yet: count only).
    return items.joinToString(", ") + "."
  }

  private fun myFlare(s: WidgetState.Ready, layout: Layout, now: Instant, overlay: OverlayModel?): Content.MyFlare {
    val f = s.myFlare!!
    val r = Res.of(f.category)
    val fr = Res.flare(f.category)
    val toMeet = maxOf(0L, minutesBetween(now, f.meetAt))
    val left = maxOf(0L, minutesBetween(now, f.expiresAt))
    val chips =
      f.replies.take(2).map {
        when (it) {
          is Reply.In -> ReplyChip(copy.t(R.string.clink_wm_live_chip_in, "name" to Copy.truncate(it.name, Copy.NAME)))
          is Reply.Bring ->
            ReplyChip(
              copy.t(
                R.string.clink_wm_live_chip_bring,
                "name" to Copy.truncate(it.name, Copy.NAME),
                "drink_short" to Copy.truncate(it.drinkShort, Copy.DRINK_SHORT),
              )
            )
        }
      }
    val more = (f.replies.size - chips.size).takeIf { it > 0 }?.let { copy.t(R.string.clink_wm_live_more, "n" to it) }
    val ins = f.replies.count { it is Reply.In }
    val spoken =
      if (f.place != null) {
        copy.t(R.string.clink_a11y_w_live, "cat" to f.label, "place" to f.place, "left_words" to copy.words(left), "replies" to repliesSpoken(f.replies))
      } else {
        copy.t(R.string.clink_a11y_w_live_noplace, "cat" to f.label, "left_words" to copy.words(left), "replies" to repliesSpoken(f.replies))
      }
    return Content.MyFlare(
      background = fr.widgetLive,
      glyph = r.glyphOnSolid,
      hero = r.hero,
      textColor = r.onSolid,
      title =
        if (layout.small) copy.t(R.string.clink_ws_live, "cat" to f.label)
        else copy.t(R.string.clink_wm_live_title, "cat_cap" to cap(f.label), "mins" to copy.mins(toMeet)),
      place = f.place?.let { copy.t(R.string.clink_wm_live_place, "place" to Copy.truncate(it, Copy.PLACE)) },
      expiresAt = f.expiresAt,
      chips = chips,
      chipBackground = fr.pillTint,
      more = more,
      noneText = if (f.replies.isEmpty()) copy.t(R.string.clink_wm_live_none) else null,
      counts = copy.t(R.string.clink_ws_live_counts, "in" to ins),
      a11y = spoken,
      overlay = overlay,
    )
  }

  private fun incoming(s: WidgetState.Ready, v: WidgetView.Incoming, layout: Layout, now: Instant, overlay: OverlayModel?): Content.Incoming {
    val f: IncomingFlare = s.incoming.first { it.flareId == v.flareId }
    val r = Res.of(f.category)
    val fr = Res.flare(f.category)
    val toMeet = maxOf(0L, minutesBetween(now, f.meetAt))
    val left = maxOf(0L, minutesBetween(now, f.expiresAt))
    val name = Copy.truncate(f.senderName, Copy.NAME)
    val small = layout.small
    val spoken =
      if (f.place != null) {
        copy.t(R.string.clink_a11y_w_incoming, "name" to f.senderName, "wants" to f.wants, "place" to f.place, "mins" to copy.mins(toMeet), "left_words" to copy.words(left))
      } else {
        copy.t(R.string.clink_a11y_w_incoming_noplace, "name" to f.senderName, "wants" to f.wants, "mins" to copy.mins(toMeet), "left_words" to copy.words(left))
      }
    val replied =
      when (val m = f.myResponse) {
        null -> null
        is MyResponse.In -> copy.t(if (small) R.string.clink_ws_in_done else R.string.clink_wm_in_done_in)
        is MyResponse.Bring -> copy.t(R.string.clink_wm_in_done_bring, "drink_short" to Copy.truncate(m.drinkShort, Copy.DRINK_SHORT))
      }
    val repliedA11y =
      when (val m = f.myResponse) {
        null -> null
        is MyResponse.In -> copy.t(R.string.clink_a11y_w_replied_in)
        is MyResponse.Bring -> copy.t(R.string.clink_a11y_w_replied_bring, "drink" to m.drinkShort)
      }
    // M4 sends I'm in and Bring me one from here; until then both open the app.
    val join =
      ButtonModel(
        copy.t(if (small) R.string.clink_ws_in_btn else R.string.clink_wm_in_btn_in),
        null,
        fr.pillSolid,
        r.onSolid,
        Tap.Open(AppRoute.HOME),
        copy.t(R.string.clink_a11y_w_in, "name" to f.senderName, "cat" to f.label),
      )
    val bring =
      if (small) null
      else
        ButtonModel(
          copy.t(R.string.clink_wm_in_btn_bring),
          null,
          fr.pillOutline,
          R.color.clink_ink_primary,
          Tap.Open(AppRoute.HOME),
          copy.t(R.string.clink_a11y_w_bring, "name" to f.senderName),
        )
    return Content.Incoming(
      background = fr.widgetFriend,
      hero = r.hero,
      initial = f.senderName.take(1).uppercase(Locale.US),
      name = copy.t(R.string.clink_ws_in_title, "name" to name),
      title = copy.t(R.string.clink_wm_in_title, "name" to name, "wants" to f.wants),
      subTitle = copy.t(R.string.clink_ws_in_sub, "cat_cap" to cap(f.label), "mins" to copy.mins(toMeet)),
      meta =
        if (f.place != null) copy.t(R.string.clink_wm_in_meta, "place" to Copy.truncate(f.place, Copy.PLACE), "mins" to copy.mins(toMeet))
        else copy.mins(toMeet, capital = true),
      expiresAt = f.expiresAt,
      more = v.more.takeIf { it > 0 }?.let { copy.t(if (small) R.string.clink_ws_more else R.string.clink_wm_in_more, "n" to it) },
      moreA11y = v.more.takeIf { it > 0 }?.let { copy.t(R.string.clink_a11y_w_more, "n" to it) },
      join = if (replied == null) join else null,
      bring = if (replied == null) bring else null,
      replied = replied,
      repliedA11y = repliedA11y,
      a11y = spoken,
      overlay = overlay,
    )
  }

  private fun bringPicker(s: WidgetState.Ready, v: WidgetView.BringPicker, overlay: OverlayModel?): Content.BringPicker {
    val f = s.incoming.first { it.flareId == v.flareId }
    val cells =
      s.usual.map { u ->
        PickerCell(
          icon = Res.icon(u.drinkId, LogCategory.of(u.category)),
          label = Copy.truncate(u.drinkShort, Copy.DRINK_SHORT),
          background = Res.flare(u.category).cellRaised,
          tap = Tap.Open(AppRoute.HOME),
          a11y =
            if (u.hasDetails) copy.t(R.string.clink_a11y_w_bring_pick, "name" to f.senderName, "drink" to u.name)
            else copy.t(R.string.clink_a11y_w_bring_pick_plain, "name" to f.senderName, "drink" to u.name),
        )
      }
    return Content.BringPicker(Res.flare(f.category).widgetFriend, copy.t(R.string.clink_wm_bring_title), cells, copy.t(R.string.clink_a11y_w_close), overlay)
  }
}
