package com.paylingo.db

import app.cash.sqldelight.Query
import app.cash.sqldelight.TransacterImpl
import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlCursor
import app.cash.sqldelight.db.SqlDriver
import kotlin.Any
import kotlin.Long
import kotlin.String

public class AppDatabaseQueries(
  driver: SqlDriver,
) : TransacterImpl(driver) {
  public fun <T : Any> getAllSessions(mapper: (
    id: String,
    title: String,
    mode: String,
    partnerLang: String,
    createdAt: Long,
  ) -> T): Query<T> = Query(-1_348_195_706, arrayOf("Session"), driver, "AppDatabase.sq",
      "getAllSessions", "SELECT * FROM Session ORDER BY createdAt DESC") { cursor ->
    mapper(
      cursor.getString(0)!!,
      cursor.getString(1)!!,
      cursor.getString(2)!!,
      cursor.getString(3)!!,
      cursor.getLong(4)!!
    )
  }

  public fun getAllSessions(): Query<Session> = getAllSessions { id, title, mode, partnerLang,
      createdAt ->
    Session(
      id,
      title,
      mode,
      partnerLang,
      createdAt
    )
  }

  public fun <T : Any> getMessagesForSession(sessionId: String, mapper: (
    id: String,
    sessionId: String,
    text: String,
    translation: String?,
    speaker: String,
    startMs: Long,
    endMs: Long,
    isFinal: Long,
  ) -> T): Query<T> = GetMessagesForSessionQuery(sessionId) { cursor ->
    mapper(
      cursor.getString(0)!!,
      cursor.getString(1)!!,
      cursor.getString(2)!!,
      cursor.getString(3),
      cursor.getString(4)!!,
      cursor.getLong(5)!!,
      cursor.getLong(6)!!,
      cursor.getLong(7)!!
    )
  }

  public fun getMessagesForSession(sessionId: String): Query<TranscriptMessage> =
      getMessagesForSession(sessionId) { id, sessionId_, text, translation, speaker, startMs, endMs,
      isFinal ->
    TranscriptMessage(
      id,
      sessionId_,
      text,
      translation,
      speaker,
      startMs,
      endMs,
      isFinal
    )
  }

  public fun insertSession(
    id: String,
    title: String,
    mode: String,
    partnerLang: String,
    createdAt: Long,
  ) {
    driver.execute(-817_046_657, """
        |INSERT OR REPLACE INTO Session(id, title, mode, partnerLang, createdAt)
        |VALUES (?, ?, ?, ?, ?)
        """.trimMargin(), 5) {
          bindString(0, id)
          bindString(1, title)
          bindString(2, mode)
          bindString(3, partnerLang)
          bindLong(4, createdAt)
        }
    notifyQueries(-817_046_657) { emit ->
      emit("Session")
    }
  }

  public fun deleteSession(id: String) {
    driver.execute(-510_311_347, """DELETE FROM Session WHERE id = ?""", 1) {
          bindString(0, id)
        }
    notifyQueries(-510_311_347) { emit ->
      emit("Session")
    }
  }

  public fun insertMessage(
    id: String,
    sessionId: String,
    text: String,
    translation: String?,
    speaker: String,
    startMs: Long,
    endMs: Long,
    isFinal: Long,
  ) {
    driver.execute(-1_847_109_392, """
        |INSERT OR REPLACE INTO TranscriptMessage(id, sessionId, text, translation, speaker, startMs, endMs, isFinal)
        |VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """.trimMargin(), 8) {
          bindString(0, id)
          bindString(1, sessionId)
          bindString(2, text)
          bindString(3, translation)
          bindString(4, speaker)
          bindLong(5, startMs)
          bindLong(6, endMs)
          bindLong(7, isFinal)
        }
    notifyQueries(-1_847_109_392) { emit ->
      emit("TranscriptMessage")
    }
  }

  public fun deleteMessagesForSession(sessionId: String) {
    driver.execute(-264_057_374, """DELETE FROM TranscriptMessage WHERE sessionId = ?""", 1) {
          bindString(0, sessionId)
        }
    notifyQueries(-264_057_374) { emit ->
      emit("TranscriptMessage")
    }
  }

  private inner class GetMessagesForSessionQuery<out T : Any>(
    public val sessionId: String,
    mapper: (SqlCursor) -> T,
  ) : Query<T>(mapper) {
    override fun addListener(listener: Query.Listener) {
      driver.addListener("TranscriptMessage", listener = listener)
    }

    override fun removeListener(listener: Query.Listener) {
      driver.removeListener("TranscriptMessage", listener = listener)
    }

    override fun <R> execute(mapper: (SqlCursor) -> QueryResult<R>): QueryResult<R> =
        driver.executeQuery(2_138_549_713,
        """SELECT * FROM TranscriptMessage WHERE sessionId = ? ORDER BY startMs ASC""", mapper, 1) {
      bindString(0, sessionId)
    }

    override fun toString(): String = "AppDatabase.sq:getMessagesForSession"
  }
}
