package com.paylingo.utils

import platform.Foundation.NSUserDefaults

actual object UserPreferences {
    private val defaults get() = NSUserDefaults.standardUserDefaults

    actual fun getUserName(): String = defaults.stringForKey("paylingo_user_name") ?: ""

    actual fun setUserName(name: String) {
        defaults.setObject(name.trim(), forKey = "paylingo_user_name")
    }

    actual fun getSonioxApiKey(): String = defaults.stringForKey("paylingo_soniox_api_key") ?: ""

    actual fun setSonioxApiKey(key: String) {
        defaults.setObject(key.trim(), forKey = "paylingo_soniox_api_key")
    }

    actual fun getLayoutMode(): String = defaults.stringForKey("paylingo_layout_mode") ?: "stacked"

    actual fun setLayoutMode(mode: String) {
        defaults.setObject(mode, forKey = "paylingo_layout_mode")
    }

    actual fun getFontSize(): Int {
        val v = defaults.integerForKey("paylingo_font_size").toInt()
        return if (v in listOf(75, 100, 120, 150)) v else 100
    }

    actual fun setFontSize(size: Int) {
        defaults.setInteger(size.toLong(), forKey = "paylingo_font_size")
    }

    actual fun getThemeMode(): String = defaults.stringForKey("paylingo_theme_mode") ?: "dark"

    actual fun setThemeMode(theme: String) {
        defaults.setObject(theme, forKey = "paylingo_theme_mode")
    }
}
