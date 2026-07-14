import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'
import {
  hashSharedPassword,
  isLegacySharedPasswordHash,
  verifySharedPassword,
} from '@/lib/shared-password'

export const runtime = 'edge'

const shareRequestSchema = z.object({
  action: z.enum(['verify']).optional(),
  id: z.string().uuid().optional(),
  password: z.string().max(200).optional().default(''),
  sessionId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  summaryContent: z.string().min(1).max(500_000).optional(),
})

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

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
      const isValid = await verifySharedPassword(password, summary.password_hash)
      if (!isValid) {
        await wait(600)
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
  } catch (error: unknown) {
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
    const parsedBody = shareRequestSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Dữ liệu chia sẻ không hợp lệ' }, { status: 400 })
    }
    const { action, id, password, sessionId, folderId, title, summaryContent } = parsedBody.data

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
        const isValid = await verifySharedPassword(password, summary.password_hash)
        if (!isValid) {
          await wait(600)
          return NextResponse.json({ error: 'Mật khẩu không chính xác', isLocked: true }, { status: 401 })
        }

        if (isLegacySharedPasswordHash(summary.password_hash)) {
          const upgradedHash = await hashSharedPassword(password)
          await supabase.from('shared_summaries').update({ password_hash: upgradedHash }).eq('id', summary.id)
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

    if (Boolean(sessionId) === Boolean(folderId)) {
      return NextResponse.json({ error: 'Chỉ được chia sẻ một cuộc hội thoại hoặc một thư mục' }, { status: 400 })
    }

    const parentQuery = sessionId
      ? supabase.from('sessions').select('id').eq('id', sessionId).single()
      : supabase.from('folders').select('id').eq('id', folderId!).single()
    const { data: ownedParent, error: parentError } = await parentQuery
    if (parentError || !ownedParent) {
      return NextResponse.json({ error: 'Bạn không có quyền chia sẻ nội dung này' }, { status: 403 })
    }

    const passHash = await hashSharedPassword(password)
    
    // Check if summary already exists for this session or folder
    let query = supabase.from('shared_summaries').select('id')
    if (sessionId) {
      query = query.eq('session_id', sessionId)
    } else {
      query = query.eq('folder_id', folderId)
    }
    const { data: existing } = await query

    let resultId = ''
    if (existing && existing.length > 0) {
      // Update existing
      const { data: updated, error: updateError } = await supabase
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
      const { data: inserted, error: insertError } = await supabase
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
  } catch (error: unknown) {
    console.error('Error creating/verifying shared summary:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 })
  }
}
