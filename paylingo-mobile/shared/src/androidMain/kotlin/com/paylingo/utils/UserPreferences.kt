package com.paylingo.utils

import android.content.Context

actual object UserPreferences {
    private const val PREFS_NAME = "paylingo_prefs"

    private fun prefs() = AndroidAppContext.context?.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    actual fun getUserName(): String = prefs()?.getString("user_name", "") ?: ""

    actual fun setUserName(name: String) {
        prefs()?.edit()?.putString("user_name", name.trim())?.apply()
    }

    actual fun getSonioxApiKey(): String = prefs()?.getString("soniox_api_key", "") ?: ""

    actual fun setSonioxApiKey(key: String) {
        prefs()?.edit()?.putString("soniox_api_key", key.trim())?.apply()
    }

    actual fun getLayoutMode(): String = prefs()?.getString("layout_mode", "stacked") ?: "stacked"

    actual fun setLayoutMode(mode: String) {
        prefs()?.edit()?.putString("layout_mode", mode)?.apply()
    }

    actual fun getFontSize(): Int = prefs()?.getInt("font_size", 100) ?: 100

    actual fun setFontSize(size: Int) {
        prefs()?.edit()?.putInt("font_size", size)?.apply()
    }

    actual fun getThemeMode(): String = prefs()?.getString("theme_mode", "dark") ?: "dark"

    actual fun setThemeMode(theme: String) {
        prefs()?.edit()?.putString("theme_mode", theme)?.apply()
    }
}
