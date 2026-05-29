import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const username = user.user_metadata?.username
    if (!username) {
      return NextResponse.json({ error: 'Không tìm thấy username của người dùng' }, { status: 400 })
    }

    const body = await req.json()
    const { sessionId, folderId, sessions, entries, style } = body

    if (!sessionId && !folderId && !entries) {
      return NextResponse.json({ error: 'Thiếu thông tin cuộc hội thoại' }, { status: 400 })
    }

    let sessionsToSummarize = []
    let allEntries = []

    // Local-first fallback: If client sends the sessions and entries directly, use them
    if (sessions && entries) {
      sessionsToSummarize = sessions
      allEntries = entries
    } else if (sessionId) {
      // Fetch single session from Supabase
      const { data: sessionData, error: sessError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (sessError || !sessionData) {
        return NextResponse.json({ error: 'Không tìm thấy cuộc hội thoại' }, { status: 404 })
      }

      if (sessionData.username !== username) {
        return NextResponse.json({ error: 'Bạn không có quyền truy cập cuộc hội thoại này' }, { status: 403 })
      }

      sessionsToSummarize.push(sessionData)

      const { data: dbEntries, error: entriesError } = await supabase
        .from('transcript_entries')
        .select('*')
        .eq('session_id', sessionId)
        .order('start_ms', { ascending: true })

      if (entriesError) {
        return NextResponse.json({ error: 'Không thể tải transcript entries' }, { status: 500 })
      }

      allEntries = dbEntries || []
    } else if (folderId) {
      // Fetch folder details and all sessions in folder from Supabase
      const { data: folderData, error: folderError } = await supabase
        .from('folders')
        .select('*')
        .eq('id', folderId)
        .single()

      if (folderError || !folderData) {
        return NextResponse.json({ error: 'Không tìm thấy thư mục' }, { status: 404 })
      }

      if (folderData.username !== username) {
        return NextResponse.json({ error: 'Bạn không có quyền truy cập thư mục này' }, { status: 403 })
      }

      const { data: folderSessions, error: sessError } = await supabase
        .from('sessions')
        .select('*')
        .eq('folder_id', folderId)
        .order('started_at', { ascending: true })

      if (sessError || !folderSessions) {
        return NextResponse.json({ error: 'Không thể tải các cuộc hội thoại trong thư mục' }, { status: 500 })
      }

      sessionsToSummarize = folderSessions

      for (const sess of folderSessions) {
        const { data: dbEntries, error: entriesError } = await supabase
          .from('transcript_entries')
          .select('*')
          .eq('session_id', sess.id)
          .order('start_ms', { ascending: true })

        if (!entriesError && dbEntries) {
          allEntries.push(...dbEntries.map(e => ({ ...e, sessionName: sess.name })))
        }
      }
    }

    if (allEntries.length === 0) {
      return NextResponse.json({ error: 'Hội thoại trống, không có dữ liệu để tóm tắt' }, { status: 400 })
    }

    // Format transcripts for AI model
    let formattedTranscript = ''
    if (sessionsToSummarize.length === 1 && !folderId) {
      const sess = sessionsToSummarize[0]
      formattedTranscript += `TÊN CUỘC HỘI THOẠI: ${sess.name}\n`
      formattedTranscript += `Ngôn ngữ đối tác: ${sess.partner_language}\n`
      formattedTranscript += `Bắt đầu lúc: ${sess.started_at}\n\n`
      
      allEntries.forEach((entry: any) => {
        const timeStr = new Date(entry.start_ms).toLocaleTimeString('vi-VN', { hour12: false })
        const speaker = entry.speaker === 'host' ? 'Host (Bạn - Tiếng Việt)' : `Partner (Đối tác - ${sess.partner_language})`
        formattedTranscript += `[${timeStr}] ${speaker}:\n`
        formattedTranscript += `- Gốc: ${entry.original_text}\n`
        formattedTranscript += `- Dịch: ${entry.translated_text}\n\n`
      })
    } else {
      formattedTranscript += `THƯ MỤC HỘI THOẠI CHUNG\n\n`
      let currentSessionName = ''
      allEntries.forEach((entry: any) => {
        if (entry.sessionName !== currentSessionName) {
          currentSessionName = entry.sessionName
          formattedTranscript += `--- PHÂN ĐOẠN HỘI THOẠI: ${currentSessionName} ---\n\n`
        }
        const timeStr = new Date(entry.start_ms).toLocaleTimeString('vi-VN', { hour12: false })
        const speaker = entry.speaker === 'host' ? 'Host (Bạn - Tiếng Việt)' : `Partner (Đối tác)`
        formattedTranscript += `[${timeStr}] ${speaker}:\n`
        formattedTranscript += `- Gốc: ${entry.original_text}\n`
        formattedTranscript += `- Dịch: ${entry.translated_text}\n\n`
      })
    }

    // Fetch active API configurations from Supabase securely
    const adminSupa = createAdminClient()
    const { data: settings } = await adminSupa
      .from('api_settings')
      .select('*')
      .eq('key', 'current')
      .single()

    const provider = settings?.provider || 'openai'
    const model = settings?.model || 'cx/gpt-5.5'
    const endpoint = settings?.endpoint || 'https://9r.9phut.org/v1'
    const apiKey = settings?.api_key || ''

    // Define tone and formatting instructions based on selected style
    let toneInstruction = "Giữ nguyên ý chính, câu từ tự nhiên, lịch sự và trôi chảy."
    if (style === 'formal') {
      toneInstruction = "Giọng điệu cực kỳ trang trọng, chuyên nghiệp, sử dụng cấu trúc câu chuẩn mực ngữ pháp doanh nghiệp, thay thế các từ ngữ nói suồng sã bằng thuật ngữ lịch thiệp, lịch sự."
    } else if (style === 'casual') {
      toneInstruction = "Giọng điệu thân mật, thoải mái, tự nhiên, giữ nguyên phong cách trò chuyện hằng ngày nhưng vẫn trôi chảy và dễ đọc."
    } else if (style === 'very_casual') {
      toneInstruction = "Sử dụng chữ viết thường (lowercase) ở mức tối đa, tối giản hóa dấu câu, câu từ cực kỳ ngắn gọn giống như phong cách gửi tin nhắn nhanh (quick chat) trên các ứng dụng trò chuyện."
    }

    const prompt = `Bạn là một trợ lý AI chuyên nghiệp có nhiệm vụ tóm tắt cuộc họp/cuộc trò chuyện dựa trên bản dịch hội thoại song ngữ của hai người (Host là người Việt, Partner là người nước ngoài). Hãy tạo ra một bản tóm tắt cực kỳ chuyên nghiệp bằng tiếng Việt với các phần sau:
1. **Text sạch (Clean Text)**: Chuyển đổi cuộc hội thoại thành một đoạn văn trôi chảy, kết nối logic các câu nói của hai bên, loại bỏ các từ đệm, từ lặp, ngắc ngứ. Đặc biệt, hãy viết phần này và toàn bộ bản tóm tắt theo phong cách: "${toneInstruction}".
2. **Nhận diện người nói (Speaker Identification)**: Nêu rõ vai trò, mục tiêu chính của từng người nói (Host và Partner) trong buổi đàm thoại.
3. **Tóm tắt điều hành (Executive Summary)**: Mô tả ngắn gọn chủ đề, mục đích, bối cảnh và kết quả tổng quan của cuộc hội thoại (2-3 câu).
4. **Hành động kế tiếp (Action Items)**: Danh sách các việc cần làm, ai chịu trách nhiệm, thời hạn (nếu có).
5. **Quyết định (Decisions)**: Các quyết định quan trọng đã được thống nhất giữa hai bên.
6. **Rủi ro (Risks)**: Các vấn đề, khó khăn, rủi ro hoặc điểm chưa đồng thuận được đề cập.
7. **Sơ đồ tư duy cuộc họp (Mind Map)**: Biểu diễn cấu trúc nội dung thảo luận dưới dạng sơ đồ hình cây văn bản thụt lề rõ ràng (sử dụng ký tự dạng cây như ├─, └─ hoặc các dấu gạch đầu dòng lồng nhau chuyên nghiệp).

Yêu cầu định dạng: Định dạng Markdown cực kỳ đẹp mắt, sử dụng các tiêu đề lớn rõ ràng, các biểu tượng emoji phù hợp để trực quan hóa, tối ưu hóa giao diện hiển thị xuất sắc cả trên máy tính và thiết bị di động (Mobile).

Dưới đây là transcript cuộc đàm thoại:
${formattedTranscript}
`

    let summaryText = ''
    let promptTokens = 0
    let completionTokens = 0
    let estimatedCost = 0.0

    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192,
          },
        }),
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error('Gemini API Error:', errText)
        return NextResponse.json({ error: `Lỗi Gemini API: ${response.statusText}` }, { status: 500 })
      }

      const resData = await response.json()
      summaryText = resData?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      promptTokens = resData?.usageMetadata?.promptTokenCount || 0
      completionTokens = resData?.usageMetadata?.candidatesTokenCount || 0

      // Gemini 2.5 Flash estimated pricing: Prompt: $0.075 / 1M, Completion: $0.30 / 1M
      estimatedCost = (promptTokens * 0.000000075) + (completionTokens * 0.00000030)
    } else if (provider === 'openai') {
      const baseUrl = endpoint.trim().replace(/\/$/, '') || 'https://api.openai.com/v1'
      const url = `${baseUrl}/chat/completions`

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: 'You are a professional meeting summary assistant.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2
        })
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error('OpenAI compatible API Error:', errText)
        return NextResponse.json({ error: `Lỗi OpenAI API: ${response.statusText}` }, { status: 500 })
      }

      const resData = await response.json()
      summaryText = resData?.choices?.[0]?.message?.content || ''
      promptTokens = resData?.usage?.prompt_tokens || 0
      completionTokens = resData?.usage?.completion_tokens || 0

      // Standard OpenAI mini compatible pricing estimation: Prompt: $0.150 / 1M, Completion: $0.600 / 1M
      estimatedCost = (promptTokens * 0.00000015) + (completionTokens * 0.00000060)
    }

    if (!summaryText) {
      return NextResponse.json({ error: 'AI không trả về kết quả tóm tắt' }, { status: 500 })
    }

    // Write token usage to system logs securely inside admin table
    const { error: logError } = await adminSupa
      .from('ai_usage_logs')
      .insert({
        username,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        model,
        cost_usd: estimatedCost
      })

    if (logError) {
      console.error('Failed to log token usage:', logError.message)
    }

    return NextResponse.json({ summary: summaryText })
  } catch (error: any) {
    console.error('Error in summarize API:', error)
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống khi tóm tắt' }, { status: 500 })
  }
}
