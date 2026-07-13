package com.paylingo.utils

import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class VersionConfig(
    val minVersionAndroid: String = "1.0.0",
    val latestVersionAndroid: String = "1.0.0",
    val updateUrlAndroid: String = "https://noidi.9phut.org/downloads/paylingo.apk",
    val minVersionIos: String = "1.0.0",
    val latestVersionIos: String = "1.0.0",
    val updateUrlIos: String = "https://testflight.apple.com/join/mock"
)

object VersionComparator {
    fun isUpdateRequired(current: String, minimumRequired: String): Boolean {
        val currentParts = current.split(".").mapNotNull { it.toIntOrNull() }
        val minParts = minimumRequired.split(".").mapNotNull { it.toIntOrNull() }
        
        val maxLength = maxOf(currentParts.size, minParts.size)
        for (i in 0 until maxLength) {
            val currentVal = currentParts.getOrElse(i) { 0 }
            val minVal = minParts.getOrElse(i) { 0 }
            
            if (currentVal < minVal) return true
            if (currentVal > minVal) return false
        }
        return false
    }
}

class UpdateManager {
    private val client = HttpClient()

    suspend fun checkUpdate(): UpdateCheckResult {
        return try {
            // Get constraints from user Next.js VPS endpoint
            val response = client.get("https://noidi.9phut.org/api/app-version")
            val jsonText = response.bodyAsText()
            val config = Json { ignoreUnknownKeys = true }.decodeFromString<VersionConfig>(jsonText)

            val current = appVersionName
            val isAndroid = platformName == "android"

            val minRequired = if (isAndroid) config.minVersionAndroid else config.minVersionIos
            val updateUrl = if (isAndroid) config.updateUrlAndroid else config.updateUrlIos

            val needsUpdate = VersionComparator.isUpdateRequired(current, minRequired)

            UpdateCheckResult.Success(needsUpdate = needsUpdate, updateUrl = updateUrl)
        } catch (e: Exception) {
            UpdateCheckResult.Failure(e.message ?: "Unknown version fetch error")
        }
    }
}

sealed class UpdateCheckResult {
    data class Success(val needsUpdate: Boolean, val updateUrl: String) : UpdateCheckResult()
    data class Failure(val error: String) : UpdateCheckResult()
}
