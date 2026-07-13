package com.paylingo.utils

actual val appVersionName: String
    get() {
        val ctx = AndroidAppContext.context ?: return "1.0.0"
        return try {
            val pInfo = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
            pInfo.versionName ?: "1.0.0"
        } catch (e: Exception) {
            "1.0.0"
        }
    }

actual val platformName: String = "android"
