package com.paylingo.db

import kotlin.Long
import kotlin.String

public data class Session(
  public val id: String,
  public val title: String,
  public val mode: String,
  public val partnerLang: String,
  public val createdAt: Long,
)
