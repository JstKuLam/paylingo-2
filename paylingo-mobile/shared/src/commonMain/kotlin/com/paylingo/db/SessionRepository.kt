package com.paylingo.db

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.withContext

class SessionRepository(databaseDriverFactory: DatabaseDriverFactory) {
    private val driver = databaseDriverFactory.createDriver()
    private val database = AppDatabase(driver)
    private val queries = database.appDatabaseQueries

    suspend fun saveSession(
        id: String,
        title: String,
        mode: String,
        partnerLang: String,
        createdAt: Long
    ) = withContext(Dispatchers.IO) {
        queries.insertSession(id, title, mode, partnerLang, createdAt)
    }

    suspend fun getAllSessions(): List<Session> = withContext(Dispatchers.IO) {
        queries.getAllSessions().executeAsList()
    }

    suspend fun deleteSession(id: String) = withContext(Dispatchers.IO) {
        queries.deleteSession(id)
        queries.deleteMessagesForSession(id)
    }

    suspend fun saveMessage(
        id: String,
        sessionId: String,
        text: String,
        translation: String?,
        speaker: String,
        startMs: Long,
        endMs: Long,
        isFinal: Boolean
    ) = withContext(Dispatchers.IO) {
        queries.insertMessage(
            id = id,
            sessionId = sessionId,
            text = text,
            translation = translation,
            speaker = speaker,
            startMs = startMs,
            endMs = endMs,
            isFinal = if (isFinal) 1L else 0L
        )
    }

    suspend fun getMessagesForSession(sessionId: String): List<TranscriptMessage> = withContext(Dispatchers.IO) {
        queries.getMessagesForSession(sessionId).executeAsList()
    }
}
