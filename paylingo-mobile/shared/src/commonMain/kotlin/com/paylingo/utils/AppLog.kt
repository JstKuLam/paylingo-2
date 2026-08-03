package com.paylingo.utils

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

object AppLog {
    private const val MAX_LOG_LINES = 200
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
        val sanitized = line
            .replace(Regex("(?i)(access[_ -]?token|refresh[_ -]?token|api[_ -]?key|authorization|cookie)\\s*[:=]\\s*[^\\s,}]+"), "${'$'}1=[REDACTED]")
        _logs.update { (it + sanitized).takeLast(MAX_LOG_LINES) }
    }
    
    fun clear() {
        _logs.update { emptyList() }
    }
}
