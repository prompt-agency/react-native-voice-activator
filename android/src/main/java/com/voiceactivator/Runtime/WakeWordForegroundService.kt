package com.voiceactivator.Runtime

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

private const val CHANNEL_ID = "voice_activator_runtime"
private const val CHANNEL_NAME = "Voice Activator Runtime"
private const val NOTIFICATION_ID = 4017

internal class WakeWordForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    ensureNotificationChannel()
    val notification = buildNotification()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    return START_NOT_STICKY
  }

  override fun onDestroy() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun ensureNotificationChannel() {
    val notificationManager =
      getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    if (notificationManager.getNotificationChannel(CHANNEL_ID) != null) {
      return
    }

    notificationManager.createNotificationChannel(
      NotificationChannel(
        CHANNEL_ID,
        CHANNEL_NAME,
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description =
          "Foreground-service notification used while wake word detection is active."
      }
    )
  }

  private fun buildNotification(): Notification {
    val icon = applicationInfo.icon.takeIf { it != 0 }
      ?: android.R.drawable.ic_btn_speak_now

    return Notification.Builder(this, CHANNEL_ID)
      .setSmallIcon(icon)
      .setContentTitle("Voice activator is listening")
      .setContentText(
        "Wake word detection is active through the Android foreground-service runtime."
      )
      .setOngoing(true)
      .build()
  }
}
