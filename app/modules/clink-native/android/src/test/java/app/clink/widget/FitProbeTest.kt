package app.clink.widget

import android.content.Context
import android.graphics.Typeface
import android.util.TypedValue
import android.widget.TextView
import androidx.test.core.app.ApplicationProvider
import app.clink.widget.ui.TextFit
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp-xxhdpi")
class FitProbeTest {
  @Test
  fun probe() {
    val c: Context = ApplicationProvider.getApplicationContext()
    val d = c.resources.displayMetrics.density
    for (fam in listOf("sans-serif", "sans-serif-medium")) {
      val tv = TextView(c)
      tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
      tv.typeface = Typeface.create(fam, Typeface.NORMAL)
      val w = tv.paint.measureText("Flat White") / d
      println("PROBE $fam tv=$w fit=${TextFit.width("Flat White", 13f, if (fam == "sans-serif") TextFit.Face.REGULAR else TextFit.Face.MEDIUM)}")
    }
    // Glance-like: medium via TextAppearance / fontWeight 500
    val tv = TextView(c)
    tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
    tv.typeface = Typeface.create(Typeface.DEFAULT, 500, false)
    println("PROBE w500 tv=${tv.paint.measureText("Flat White") / d}")
    tv.typeface = Typeface.DEFAULT_BOLD
    println("PROBE bold tv=${tv.paint.measureText("Flat White") / d}")
  }
}
