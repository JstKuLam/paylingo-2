import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const runtime = 'edge'

// Simple helper to hash the password securely on the server
async function hashPassword(password: string): Promise<string | null> {
  if (!password) return null
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * GET handler: Fetch info about a shared summary.
 * If password is set, it only returns metadata (title, hasPassword: true) and NOT the content.
 * It will only return the content if there is no password.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const password = searchParams.get('password') || ''

    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID chia sẻ' }, { status: 400 })
    }

    const supabase = createAdminClient() // use admin/service client since anonymous readers bypass RLS for reading but need password verification
    const { data: summary, error } = await supabase
      .from('shared_summaries')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !summary) {
      return NextResponse.json({ error: 'Không tìm thấy liên kết chia sẻ' }, { status: 404 })
    }

    const hasPassword = !!summary.password_hash

    // If password-protected, verify
    if (hasPassword) {
      const inputHash = await hashPassword(password)
      if (inputHash !== summary.password_hash) {
        return NextResponse.json({
          id: summary.id,
          title: summary.title,
          hasPassword: true,
          isLocked: true,
          created_at: summary.created_at
        })
      }
    }

    // Return full content if no password or password verified
    return NextResponse.json({
      id: summary.id,
      title: summary.title,
      summary_content: summary.summary_content,
      hasPassword,
      isLocked: false,
      created_at: summary.created_at
    })
  } catch (error: any) {
    console.error('Error fetching shared summary:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống khi tải chia sẻ' }, { status: 500 })
  }
}

/**
 * POST handler:
 * - Case 1: Create a new shared summary (if authenticated user)
 * - Case 2: Verify password and fetch content
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { action, id, password, sessionId, folderId, title, summaryContent } = body

    // Case 2: Verify password of existing shared summary
    if (action === 'verify') {
      if (!id) {
        return NextResponse.json({ error: 'Thiếu ID chia sẻ' }, { status: 400 })
      }

      const supabase = createAdminClient()
      const { data: summary, error } = await supabase
        .from('shared_summaries')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !summary) {
        return NextResponse.json({ error: 'Không tìm thấy liên kết chia sẻ' }, { status: 404 })
      }

      const hasPassword = !!summary.password_hash
      if (hasPassword) {
        const inputHash = await hashPassword(password || '')
        if (inputHash !== summary.password_hash) {
          return NextResponse.json({ error: 'Mật khẩu không chính xác', isLocked: true }, { status: 401 })
        }
      }

      return NextResponse.json({
        id: summary.id,
        title: summary.title,
        summary_content: summary.summary_content,
        hasPassword,
        isLocked: false,
        created_at: summary.created_at
      })
    }

    // Case 1: Create a new shared summary
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    if (!title || !summaryContent) {
      return NextResponse.json({ error: 'Thiếu tiêu đề hoặc nội dung tóm tắt' }, { status: 400 })
    }

    if (!sessionId && !folderId) {
      return NextResponse.json({ error: 'Cần cung cấp sessionId hoặc folderId' }, { status: 400 })
    }

    const passHash = password ? await hashPassword(password) : null

    // Write using service role client to ensure database insert bypasses restrictive write RLS on custom schema relations if needed
    const adminSupa = createAdminClient()
    
    // Check if summary already exists for this session or folder
    let query = adminSupa.from('shared_summaries').select('id')
    if (sessionId) {
      query = query.eq('session_id', sessionId)
    } else {
      query = query.eq('folder_id', folderId)
    }
    const { data: existing } = await query

    let resultId = ''
    if (existing && existing.length > 0) {
      // Update existing
      const { data: updated, error: updateError } = await adminSupa
        .from('shared_summaries')
        .update({
          title,
          summary_content: summaryContent,
          password_hash: passHash,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing[0].id)
        .select('id')
        .single()

      if (updateError) {
        console.error('Update shared summary error:', updateError)
        return NextResponse.json({ error: 'Không thể cập nhật liên kết chia sẻ' }, { status: 500 })
      }
      resultId = updated.id
    } else {
      // Insert new
      const { data: inserted, error: insertError } = await adminSupa
        .from('shared_summaries')
        .insert({
          session_id: sessionId || null,
          folder_id: folderId || null,
          title,
          summary_content: summaryContent,
          password_hash: passHash
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('Insert shared summary error:', insertError)
        return NextResponse.json({ error: 'Không thể tạo liên kết chia sẻ' }, { status: 500 })
      }
      resultId = inserted.id
    }

    return NextResponse.json({ success: true, id: resultId })
  } catch (error: any) {
    console.error('Error creating/verifying shared summary:', error)
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống' }, { status: 500 })
  }
}
