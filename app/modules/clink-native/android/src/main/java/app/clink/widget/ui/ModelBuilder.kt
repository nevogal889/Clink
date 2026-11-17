package app.clink.widget.ui

import app.clink.nativemodule.R
import app.clink.widget.AppRoute
import app.clink.widget.model.Confirmation
import app.clink.widget.model.ConfirmationKind
import app.clink.widget.model.Countdown
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
        widthDp >= 300f -> Layout.MEDIUM_WIDE
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
    fun model(bg: Int, tap: Tap, content: Content) = WidgetModel(layout, scale, compact, fontScale, bg, tap, content)
    val overlay = overlay(view.overlay, local.confirmation, layout, ready)

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
      // A tap beside the cells closes the picker (the 4x2 and 2x2 grids have no room for a ✕).
      is WidgetView.Picker -> model(idleBg, Tap.ClosePicker, picker(ready!!, layout, overlay))
      is WidgetView.Idle -> model(idleBg, Tap.Open(AppRoute.HOME), idle(ready!!, view, sized, layout, fontScale, now, zone, overlay))
      is WidgetView.MyFlareView -> myFlare(ready!!, layout, now, overlay).let { model(it.background, Tap.Open(AppRoute.HOME), it) }
      is WidgetView.Incoming -> incoming(ready!!, view, layout, now, overlay).let { model(it.background, Tap.Open(AppRoute.HOME), it) }
      is WidgetView.BringPicker -> bringPicker(ready!!, view, overlay).let { model(it.background, Tap.Open(AppRoute.HOME), it) }
    }
  }

  // -------------------------------------------------------------------------------------------

  private fun overlay(o: Overlay?, c: Confirmation?, layout: Layout, s: WidgetState.Ready?): OverlayModel? {
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
        // The logged drink's picture: by id, else the usual slot with that name, else water.
        val art =
          if (o.kind != ConfirmationKind.LOGGED) null
          else if (c?.drinkShort == null) DrinkIcons.iconL(LogDrink.WATER_ID)
          else {
            val u = s?.usual?.firstOrNull { it.drinkId == c.drinkId && c.drinkId != null } ?: s?.usual?.firstOrNull { it.drinkShort == c.drinkShort }
            DrinkIcons.iconL(c.drinkId) ?: u?.let { Res.art(it.drinkId, LogCategory.of(it.category)) }
          }
        // a11y.w.confirm: the visible confirmation text ("Logged Flat White").
        OverlayModel.Confirm(text, detail, listOfNotNull(text, detail).joinToString(" "), art)
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

  /**
   * The countdown as text, longest first (DESIGN.md 5.1 "Time", round 3): whole minutes left,
   * rounded up so it never reads 0 while the flare is open ("14 min left", then "14 min"), and
   * "Under a minute left" in the last minute. Redrawn at each minute boundary (Deadlines).
   */
  private fun leftOptions(now: Instant, at: Instant, small: Boolean): Pair<String?, List<String>> {
    val m = Countdown.minutesLeft(now, at)
    if (m < 1) {
      val under = if (small) listOf(copy.t(R.string.clink_ws_in_left_under)) else listOf(copy.t(R.string.clink_wm_in_left_under), copy.t(R.string.clink_ws_in_left_under))
      return null to under
    }
    val full = copy.t(if (small) R.string.clink_ws_in_left else R.string.clink_wm_in_left, "n" to m)
    return m.toString() to listOf(full, copy.t(R.string.clink_ws_in_left_short, "n" to m)).distinct()
  }

  private fun tracker(s: WidgetState.Ready, v: WidgetView.Idle, layout: Layout, fontScale: Float, now: Instant, zone: ZoneId): TrackerModel {
    // Only the small widget uses the short line ("Last 7:30"); every 4x2 has room for
    // "Last drink 7:30 AM" in the tracker column (polish pass).
    val small = layout.small
    val drinks = copy.t(R.string.clink_ws_drinks, "n" to v.drinks)
    val water = copy.t(R.string.clink_ws_water, "n" to v.water)
    val (dn, dw) = Copy.splitCount(drinks)
    val (wn, ww) = Copy.splitCount(water)
    // The last-drink line counts only today's drinks: after midnight it is gone with the counts.
    val last =
      s.today.lastDrinkAt?.takeIf {
        s.today.localDate == Resolve.localDateAt(now, zone) && Resolve.localDateAt(it, zone) == s.today.localDate
      }
    // The time of day of the last drink (Head of Product, polish pass): exact and never stale, so
    // the widget needs no ticking text. Midnight clears it with the counts. With no drink today
    // there is no line at all: never "No drinks yet" next to a 0 (CEO, 2026-11-17).
    val lastOptions =
      if (last != null && small) listOf(copy.t(R.string.clink_ws_last_at, "time" to copy.time(last, zone, short = true))) else emptyList()
    // The 4x2's one small line under the numeral (CEO, 2026-11-17): "◦ 4 · Last 7:30 AM", then the
    // short time, then the water count alone. Water never gets a numeral of its own.
    val waterLine =
      if (last != null) {
        listOf(
          copy.t(R.string.clink_wm_water_last, "water" to v.water, "time" to copy.time(last, zone)),
          copy.t(R.string.clink_wm_water_last, "water" to v.water, "time" to copy.time(last, zone, short = true)),
          Copy.splitCount(water).first.ifEmpty { water },
        ).distinct()
      } else {
        listOf(Copy.splitCount(water).first.ifEmpty { water })
      }
    val a11y =
      when {
        last != null -> copy.t(R.string.clink_a11y_w_tracker_at, "drinks" to v.drinks, "water" to v.water, "time" to copy.time(last, zone))
        v.water > 0 -> copy.t(R.string.clink_a11y_w_tracker_water, "water" to v.water)
        else -> copy.t(R.string.clink_a11y_w_tracker_none)
      }
    return TrackerModel(
      drinksNum = dn,
      drinksWord = dw,
      waterNum = wn,
      waterWord = ww,
      waterText = water,
      lastOptions = lastOptions,
      waterLine = waterLine,
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
    fontScale: Float,
    now: Instant,
    zone: ZoneId,
    overlay: OverlayModel?,
  ): Content.Idle {
    val small = layout.small
    val first = s.usual.firstOrNull()
    // Usual #1, or the neutral herbal tea note after 4 caffeinated drinks (PRD 3.11): the note
    // shows a chamomile, the one herbal tea in the catalog pictures.
    val drinkTile: MediaTile.Drink? =
      when {
        v.caffeineNote ->
          MediaTile.Drink(
            DrinkIcons.iconL("tea.chamomile") ?: R.drawable.clink_glyph_tea_ink,
            copy.t(R.string.clink_wm_caff),
            Tap.OpenPicker,
            copy.t(R.string.clink_a11y_w_log),
          )
        first != null ->
          MediaTile.Drink(
            Res.art(first.drinkId, LogCategory.of(first.category)),
            copy.t(R.string.clink_wm_usual, "drink_short" to Copy.truncate(first.drinkShort, Copy.DRINK_SHORT)),
            Tap.OpenPicker,
            copy.t(R.string.clink_a11y_w_plate, "drink" to first.name),
          )
        else -> null
      }
    val usual = drinkTile?.let { UsualLine(it.art, it.name) }
    val media: MediaTile =
      when {
        v.snapId != null -> {
          val sn = s.snaps.first { it.id == v.snapId }
          val ago = maxOf(0L, minutesBetween(sn.createdAt, now))
          MediaTile.Photo(
            sn.thumbFile,
            copy.t(R.string.clink_wm_snap, "name" to Copy.truncate(sn.senderName, Copy.NAME), "ago" to copy.ago(ago)),
            Tap.Open(AppRoute.CAMERA),
            copy.t(R.string.clink_a11y_w_snap, "name" to sn.senderName, "ago_words" to copy.words(ago)),
          )
        }
        drinkTile != null -> drinkTile
        else -> {
          val text = copy.t(R.string.clink_wm_usual_none)
          MediaTile.PickUsual(text, Tap.Open(AppRoute.USUAL), text)
        }
      }
    val log =
      ButtonModel(
        label = copy.t(if (small) R.string.clink_ws_log else R.string.clink_wm_log),
        // "+1" already carries the plus, so no glyph beside it. Brand chrome: cobalt on its tint.
        icon = null,
        background = R.drawable.clink_bg_pill_cobalt_tint,
        textColor = R.color.clink_cobalt,
        // No usual 3: +1 Drink opens the app on the usual 3 editor (PRD 3.3).
        tap = if (v.noUsual) Tap.Open(AppRoute.USUAL) else Tap.OpenPicker,
        a11y = copy.t(R.string.clink_a11y_w_log),
      )
    val camera =
      ButtonModel(
        label = copy.t(R.string.clink_wm_camera),
        icon = R.drawable.clink_ui_camera_cobalt,
        background = R.drawable.clink_bg_pill_cobalt_tint,
        textColor = R.color.clink_cobalt,
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
          // PRD F15: no friends opens the app on the invite screen (CEO, 2026-11-17), never Settings.
          tap = Tap.Open(AppRoute.INVITE),
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
        // After the caffeine note the panel is tea, and Who joins? follows it (review item 10): the
        // note offers a tea, and the button under it asks friends for one.
        val cat = if (v.caffeineNote) app.clink.widget.model.FlareCategory.TEA else first.category
        val r = Res.of(cat)
        val (label, spoken) = audienceLabel(s, v)
        val groupName = v.audience?.groupId?.let { id -> s.groups.firstOrNull { it.id == id }?.name }
        // M4 sends the quick flare from here; until then Who joins? opens the camera screen. An
        // empty audience opens Settings > Widgets, where the widget's audience is picked (PRD 3.3
        // edge cases, F15 "audience empty: app hint"), and says so on the button.
        ButtonModel(
          label = copy.t(R.string.clink_wm_flare),
          icon = r.glyphOnSolid,
          background = Res.flare(cat).pillSolid,
          textColor = r.onSolid,
          tap = Tap.Open(if (v.audienceEmpty) AppRoute.SETTINGS else AppRoute.CAMERA),
          a11y =
            copy.t(
              R.string.clink_a11y_w_flare,
              "cat" to copy.t(r.word).lowercase(Locale.US),
              "audience" to spoken,
              "mins" to copy.mins(0),
            ),
          subLabel =
            if (v.audienceEmpty) copy.t(R.string.clink_wm_audience_empty, "group" to Copy.truncate(groupName ?: "", Copy.GROUP)) else label,
        )
      }
    // The panel takes the colours of what it shows: the herbal tea note in tea, else the usual #1,
    // else cobalt (no usual 3 yet).
    val panelRes =
      when {
        v.caffeineNote -> Res.of(LogCategory.TEA)
        first != null -> Res.of(first.category)
        else -> Res.of(LogCategory.WATER)
      }
    return Content.Idle(
      tracker(s, v, layout, fontScale, now, zone),
      media,
      usual,
      log,
      camera,
      whoJoins,
      panelRes.panel,
      overlay,
    )
  }

  private fun picker(s: WidgetState.Ready, layout: Layout, overlay: OverlayModel?): Content.Picker {
    val small = layout.small
    val cells =
      s.usual.map { u ->
        PickerCell(
          art = Res.art(u.drinkId, LogCategory.of(u.category)),
          label = Copy.truncate(u.drinkShort, Copy.DRINK_SHORT),
          background = Res.of(u.category).cell,
          tap = Tap.Log(u.slot),
          a11y = copy.t(R.string.clink_a11y_w_pick, "drink" to u.name),
        )
      } +
        PickerCell(
          art = DrinkIcons.iconL(LogDrink.WATER_ID) ?: R.drawable.clink_glyph_water_ink,
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
    // Spoken at minute precision, rounded up like the visible countdown.
    val left = maxOf(1L, Countdown.minutesLeft(now, f.expiresAt))
    val (leftNum, leftTexts) = leftOptions(now, f.expiresAt, layout.small)
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
    // "+N more" for every number of chips the layout manages to show (it drops chips that don't fit).
    val moreByShown = (0..chips.size).map { shown -> (f.replies.size - shown).takeIf { it > 0 }?.let { copy.t(R.string.clink_wm_live_more, "n" to it) } }
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
      leftNum = leftNum,
      leftWords = if (leftNum == null) leftTexts else leftTexts.map { Copy.splitCount(it).second },
      chips = chips,
      chipBackground = fr.pillTint,
      moreByShown = moreByShown,
      noneText = if (f.replies.isEmpty()) copy.t(R.string.clink_wm_live_none) else null,
      // "No replies yet", never "0 in" (review item 9).
      counts = if (ins == 0) copy.t(R.string.clink_ws_live_none) else copy.t(R.string.clink_ws_live_counts, "in" to ins),
      a11y = spoken,
      overlay = overlay,
    )
  }

  private fun incoming(s: WidgetState.Ready, v: WidgetView.Incoming, layout: Layout, now: Instant, overlay: OverlayModel?): Content.Incoming {
    val f: IncomingFlare = s.incoming.first { it.flareId == v.flareId }
    val r = Res.of(f.category)
    val fr = Res.flare(f.category)
    val toMeet = maxOf(0L, minutesBetween(now, f.meetAt))
    val left = maxOf(1L, Countdown.minutesLeft(now, f.expiresAt))
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
      subOptions = listOf(copy.t(R.string.clink_ws_in_sub, "cat_cap" to cap(f.label), "mins" to copy.mins(toMeet)), cap(f.label)),
      metaOptions =
        listOfNotNull(
          f.place?.let { copy.t(R.string.clink_wm_in_meta, "place" to Copy.truncate(it, Copy.PLACE), "mins" to copy.mins(toMeet)) },
          copy.mins(toMeet, capital = true),
        ),
      leftOptions = leftOptions(now, f.expiresAt, small).second,
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
          art = Res.art(u.drinkId, LogCategory.of(u.category)),
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
