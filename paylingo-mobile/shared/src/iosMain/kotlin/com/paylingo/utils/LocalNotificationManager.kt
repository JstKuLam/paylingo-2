package com.paylingo.utils

import platform.UserNotifications.UNMutableNotificationContent
import platform.UserNotifications.UNNotificationRequest
import platform.UserNotifications.UNNotificationSound
import platform.UserNotifications.UNTimeIntervalNotificationTrigger
import platform.UserNotifications.UNUserNotificationCenter
import platform.UserNotifications.UNAuthorizationOptionAlert
import platform.UserNotifications.UNAuthorizationOptionSound

actual class LocalNotificationManager actual constructor() {
    actual fun showUpdateNotification(title: String, message: String) {
        val center = UNUserNotificationCenter.currentNotificationCenter()
        
        center.requestAuthorizationWithOptions(
            options = UNAuthorizationOptionAlert or UNAuthorizationOptionSound
        ) { isGranted, _ ->
            if (isGranted) {
                val content = UNMutableNotificationContent().apply {
                    setTitle(title)
                    setBody(message)
                    setSound(UNNotificationSound.defaultNotificationSound())
                }

                val trigger = UNTimeIntervalNotificationTrigger.triggerWithTimeInterval(1.0, false)
                val request = UNNotificationRequest.requestWithIdentifier(
                    identifier = "app_update_notification",
                    content = content,
                    trigger = trigger
                )

                center.addNotificationRequest(request) { _ -> }
            }
        }
    }
}
