package app.clink.widget.ui

import app.clink.nativemodule.R
import app.clink.widget.model.FlareCategory
import app.clink.widget.model.LogCategory

// Generated resources by category (scripts/gen-android-colors.mjs, scripts/gen-drink-assets.mjs).
// Colours and drawables carry their own night variants, so nothing here depends on the theme.

data class CategoryRes(
  val solid: Int,
  val onSolid: Int,
  val tint: Int,
  val ink: Int,
  val glyph: Int,
  val glyphInk: Int,
  val glyphOnSolid: Int,
  val hero: Int,
  val cell: Int,
  val word: Int,
)

data class FlareRes(
  val widgetLive: Int,
  val widgetFriend: Int,
  val pillSolid: Int,
  val pillTint: Int,
  val pillOutline: Int,
  val cellRaised: Int,
)

object Res {
  fun of(c: LogCategory): CategoryRes =
    when (c) {
      LogCategory.COFFEE ->
        CategoryRes(
          R.color.clink_coffee_solid,
          R.color.clink_coffee_on_solid,
          R.color.clink_coffee_tint,
          R.color.clink_coffee_ink,
          R.drawable.clink_glyph_coffee,
          R.drawable.clink_glyph_coffee_ink,
          R.drawable.clink_glyph_coffee_on_solid,
          R.drawable.clink_hero_coffee,
          R.drawable.clink_bg_cell_coffee,
          R.string.clink_cat_coffee,
        )
      LogCategory.MATCHA ->
        CategoryRes(
          R.color.clink_matcha_solid,
          R.color.clink_matcha_on_solid,
          R.color.clink_matcha_tint,
          R.color.clink_matcha_ink,
          R.drawable.clink_glyph_matcha,
          R.drawable.clink_glyph_matcha_ink,
          R.drawable.clink_glyph_matcha_on_solid,
          R.drawable.clink_hero_matcha,
          R.drawable.clink_bg_cell_matcha,
          R.string.clink_cat_matcha,
        )
      LogCategory.TEA ->
        CategoryRes(
          R.color.clink_tea_solid,
          R.color.clink_tea_on_solid,
          R.color.clink_tea_tint,
          R.color.clink_tea_ink,
          R.drawable.clink_glyph_tea,
          R.drawable.clink_glyph_tea_ink,
          R.drawable.clink_glyph_tea_on_solid,
          R.drawable.clink_hero_tea,
          R.drawable.clink_bg_cell_tea,
          R.string.clink_cat_tea,
        )
      LogCategory.SMOOTHIE_JUICE ->
        CategoryRes(
          R.color.clink_smoothie_juice_solid,
          R.color.clink_smoothie_juice_on_solid,
          R.color.clink_smoothie_juice_tint,
          R.color.clink_smoothie_juice_ink,
          R.drawable.clink_glyph_smoothie_juice,
          R.drawable.clink_glyph_smoothie_juice_ink,
          R.drawable.clink_glyph_smoothie_juice_on_solid,
          R.drawable.clink_hero_smoothie_juice,
          R.drawable.clink_bg_cell_smoothie_juice,
          R.string.clink_cat_smoothie_juice,
        )
      LogCategory.WATER ->
        CategoryRes(
          R.color.clink_water_solid,
          R.color.clink_water_on_solid,
          R.color.clink_water_tint,
          R.color.clink_water_ink,
          R.drawable.clink_glyph_water,
          R.drawable.clink_glyph_water_ink,
          R.drawable.clink_glyph_water_on_solid,
          R.drawable.clink_hero_water,
          R.drawable.clink_bg_cell_water,
          R.string.clink_wm_pick_water,
        )
    }

  fun of(c: FlareCategory): CategoryRes = of(LogCategory.of(c))

  fun flare(c: FlareCategory): FlareRes =
    when (c) {
      FlareCategory.COFFEE ->
        FlareRes(
          R.drawable.clink_bg_widget_live_coffee,
          R.drawable.clink_bg_widget_friend_coffee,
          R.drawable.clink_bg_pill_coffee_solid,
          R.drawable.clink_bg_pill_coffee_tint,
          R.drawable.clink_bg_pill_outline_coffee,
          R.drawable.clink_bg_cell_raised_coffee,
        )
      FlareCategory.MATCHA ->
        FlareRes(
          R.drawable.clink_bg_widget_live_matcha,
          R.drawable.clink_bg_widget_friend_matcha,
          R.drawable.clink_bg_pill_matcha_solid,
          R.drawable.clink_bg_pill_matcha_tint,
          R.drawable.clink_bg_pill_outline_matcha,
          R.drawable.clink_bg_cell_raised_matcha,
        )
      FlareCategory.TEA ->
        FlareRes(
          R.drawable.clink_bg_widget_live_tea,
          R.drawable.clink_bg_widget_friend_tea,
          R.drawable.clink_bg_pill_tea_solid,
          R.drawable.clink_bg_pill_tea_tint,
          R.drawable.clink_bg_pill_outline_tea,
          R.drawable.clink_bg_cell_raised_tea,
        )
      FlareCategory.SMOOTHIE_JUICE ->
        FlareRes(
          R.drawable.clink_bg_widget_live_smoothie_juice,
          R.drawable.clink_bg_widget_friend_smoothie_juice,
          R.drawable.clink_bg_pill_smoothie_juice_solid,
          R.drawable.clink_bg_pill_smoothie_juice_tint,
          R.drawable.clink_bg_pill_outline_smoothie_juice,
          R.drawable.clink_bg_cell_raised_smoothie_juice,
        )
    }

  /** Icon S for a catalog drink: R.drawable.clink_icon_<category>_<slug>, or the category glyph. */
  fun icon(drinkId: String?, category: LogCategory): Int =
    DrinkIcons.iconS(drinkId) ?: of(category).glyphInk
}
