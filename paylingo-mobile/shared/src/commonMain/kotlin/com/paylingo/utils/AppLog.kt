package com.paylingo.utils

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

object AppLog {
    private val _logs = MutableStateFlow<List<String>>(emptyList())
    val logs: StateFlow<List<String>> = _logs.asStateFlow()

    fun d(tag: String, message: String) {
        val logLine = "[DEBUG] [$tag] $message"
        addLog(logLine)
    }

    fun e(tag: String, message: String, throwable: Throwable? = null) {
        val logLine = "[ERROR] [$tag] $message" + (throwable?.let { "\n${it.stackTraceToString()}" } ?: "")
        addLog(logLine)
    }

    private fun addLog(line: String) {
        val timestamp = "now" // Simple timestamp or tag
        val formatted = "$line"
        _logs.update { it + formatted }
    }
    
    fun clear() {
        _logs.update { emptyList() }
    }
}
