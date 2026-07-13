package com.paylingo.utils

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

actual class LocalNotificationManager actual constructor() {
    actual fun showUpdateNotification(title: String, message: String) {
        val ctx = AndroidAppContext.context ?: return
        val notificationManager = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        
        val channelId = "app_update_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Cập nhật ứng dụng",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Thông báo khi có bản cập nhật mới trên VPS"
            }
            notificationManager.createNotificationChannel(channel)
        }

        val intent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
        val pendingIntent = PendingIntent.getActivity(
            ctx, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(ctx, channelId)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)

        notificationManager.notify(1001, builder.build())
    }
}
