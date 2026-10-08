package expo.modules.workouttimer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WorkoutTimerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WorkoutTimer")

    Function("start") { title: String, startedAtMillis: Double ->
      showTimer(title, startedAtMillis.toLong(), true, 0)
    }

    Function("pause") { title: String, elapsedSeconds: Double ->
      showTimer(title, System.currentTimeMillis(), false, elapsedSeconds.toInt())
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function
      NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }
  }

  private fun showTimer(title: String, baseMillis: Long, running: Boolean, elapsedSeconds: Int) {
    val context = appContext.reactContext ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Workout timer", NotificationManager.IMPORTANCE_LOW))
    }
    val text = if (running) "Workout in progress" else String.format("Paused · %02d:%02d", elapsedSeconds / 60, elapsedSeconds % 60)
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle(title)
      .setContentText(text)
      .setWhen(if (running) baseMillis else System.currentTimeMillis())
      .setUsesChronometer(running)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory("workout")
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .build()
    NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
  }

  companion object {
    private const val CHANNEL_ID = "workout_timer"
    private const val NOTIFICATION_ID = 6201
  }
}
