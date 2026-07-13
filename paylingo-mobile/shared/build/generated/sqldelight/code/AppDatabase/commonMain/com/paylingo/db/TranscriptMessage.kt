package com.paylingo.db

import kotlin.Long
import kotlin.String

public data class TranscriptMessage(
  public val id: String,
  public val sessionId: String,
  public val text: String,
  public val translation: String?,
  public val speaker: String,
  public val startMs: Long,
  public val endMs: Long,
  public val isFinal: Long,
)
