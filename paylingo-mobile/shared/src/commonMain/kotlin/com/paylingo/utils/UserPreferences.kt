package com.paylingo.utils

expect object UserPreferences {
    fun getUserName(): String
    fun setUserName(name: String)
    fun getSonioxApiKey(): String
    fun setSonioxApiKey(key: String)
    fun getLayoutMode(): String
    fun setLayoutMode(mode: String)
    fun getFontSize(): Int
    fun setFontSize(size: Int)
    fun getThemeMode(): String
    fun setThemeMode(theme: String)
}
