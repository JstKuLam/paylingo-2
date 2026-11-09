package com.paylingo.network

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class SonioxParserTest {

    @Test
    fun parsesBilingualTurnsAndIgnoresEndTokenAndPreservesVietnameseSubwords() {
        val parser = SonioxParser("sess_test")

        val frame1 = """
            {
              "tokens": [
                {"text": "Hello", "is_final": true, "start_ms": 240, "end_ms": 540, "language": "en", "translation_status": "original"},
                {"text": ",", "is_final": true, "start_ms": 540, "end_ms": 600, "language": "en", "translation_status": "original"},
                {"text": " welcome", "is_final": true, "start_ms": 600, "end_ms": 960, "language": "en", "translation_status": "original"},
                {"text": ".", "is_final": true, "start_ms": 960, "end_ms": 1020, "language": "en", "translation_status": "original"},
                {"text": "<end>", "is_final": true},
                {"text": "Xin", "is_final": true, "language": "vi", "source_language": "en", "translation_status": "translation"},
                {"text": " chào", "is_final": true, "language": "vi", "source_language": "en", "translation_status": "translation"},
                {"text": ",", "is_final": true, "language": "vi", "source_language": "en", "translation_status": "translation"},
                {"text": " chào", "is_final": true, "language": "vi", "source_language": "en", "translation_status": "translation"},
                {"text": " m", "is_final": true, "language": "vi", "source_language": "en", "translation_status": "translation"},
                {"text": "ừ", "is_final": true, "language": "vi", "source_language": "en", "translation_status": "translation"},
                {"text": "ng.", "is_final": true, "language": "vi", "source_language": "en", "translation_status": "translation"}
              ]
            }
        """.trimIndent()

        val msgs1 = parser.processFrame(frame1)
        assertEquals(1, msgs1.size)
        assertEquals("partner", msgs1[0].speaker)
        assertEquals("Hello, welcome.", msgs1[0].text)
        assertEquals("Xin chào, chào mừng.", msgs1[0].translation)
        assertEquals(1L, msgs1[0].isFinal)

        val frame2 = """
            {
              "tokens": [
                {"text": "Chào", "is_final": true, "start_ms": 2100, "end_ms": 2400, "language": "vi", "translation_status": "original"},
                {"text": " bạn.", "is_final": true, "start_ms": 2400, "end_ms": 2700, "language": "vi", "translation_status": "original"},
                {"text": "<end>", "is_final": true},
                {"text": "Hello", "is_final": true, "language": "en", "source_language": "vi", "translation_status": "translation"},
                {"text": " friend.", "is_final": true, "language": "en", "source_language": "vi", "translation_status": "translation"}
              ]
            }
        """.trimIndent()

        val msgs2 = parser.processFrame(frame2)
        assertEquals(2, msgs2.size)
        assertEquals("host", msgs2[1].speaker)
        assertEquals("Chào bạn.", msgs2[1].text)
        assertEquals("Hello friend.", msgs2[1].translation)
    }

    @Test
    fun splitsConsecutiveCjkSentencesIntoSeparateTurns() {
        val parser = SonioxParser("sess_cjk")
        val frame = """
            {
              "tokens": [
                {"text": "你好，很高兴认识你。", "is_final": true, "start_ms": 100, "end_ms": 2000, "language": "zh", "translation_status": "original"},
                {"text": "Chào bạn, rất vui được gặp bạn.", "is_final": true, "language": "vi", "source_language": "zh", "translation_status": "translation"},
                {"text": "我们今天讨论合作项目。", "is_final": true, "start_ms": 2200, "end_ms": 4200, "language": "zh", "translation_status": "original"},
                {"text": "Hôm nay chúng ta thảo luận dự án hợp tác.", "is_final": true, "language": "vi", "source_language": "zh", "translation_status": "translation"}
              ]
            }
        """.trimIndent()

        val msgs = parser.processFrame(frame)
        assertEquals(2, msgs.size)
        assertEquals("你好，很高兴认识你。", msgs[0].text)
        assertEquals("Chào bạn, rất vui được gặp bạn.", msgs[0].translation)
        assertEquals("我们今天讨论合作项目。", msgs[1].text)
        assertEquals("Hôm nay chúng ta thảo luận dự án hợp tác.", msgs[1].translation)
    }

    @Test
    fun throwsOnSonioxErrorFrame() {
        val parser = SonioxParser("sess_err")
        assertFailsWith<IllegalStateException> {
            parser.processFrame("""{"error_code": 401, "error_message": "Invalid API key"}""")
        }
    }

    @Test
    fun filtersEnglishAndVietnameseMultiCharFillerWordsOnOriginalSpeech() {
        val parser = SonioxParser("sess_filler")
        val frame = """
            {
              "tokens": [
                {"text": "uh", "is_final": true, "start_ms": 100, "end_ms": 200, "language": "en", "translation_status": "original"},
                {"text": "Let's", "is_final": true, "start_ms": 220, "end_ms": 500, "language": "en", "translation_status": "original"},
                {"text": " start.", "is_final": true, "start_ms": 500, "end_ms": 800, "language": "en", "translation_status": "original"}
              ]
            }
        """.trimIndent()
        val msgs = parser.processFrame(frame)
        assertEquals(1, msgs.size)
        assertEquals("Let's start.", msgs[0].text)
        assertNull(msgs[0].translation)
    }
}
