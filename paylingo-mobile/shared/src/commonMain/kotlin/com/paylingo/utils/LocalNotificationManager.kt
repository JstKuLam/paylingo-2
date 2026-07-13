package com.paylingo.utils

expect class LocalNotificationManager {
    constructor()
    fun showUpdateNotification(title: String, message: String)
}
