<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:shadcn-lint-rules -->
# Design System & Styling Rules (@shadcn/lint)

The project enforces Tailwind v4 design system rules via `@shadcn/lint`.
Whenever creating, modifying, or refactoring UI components or pages:
1. **Never restyle core components**: Components (like `<Button>`, `<Card>`, etc.) own their internal sizing, padding, and shape. Use variants/props (e.g. `size="sm" | "lg"`, `variant="outline"`) instead of overriding with classes like `p-*`, `h-*`, or `rounded-*`.
2. **No arbitrary values**: Do not use arbitrary Tailwind values like `h-[48px]`, `p-[13px]`, or `w-[320px]`. Always use standard scale values (e.g. `h-12`, `p-3`, `w-80`).
3. **No raw/undeclared colors**: Use declared theme color tokens from `src/app/globals.css` (e.g. `bg-primary`, `text-muted-foreground`, `border-border`, etc.) instead of undeclared colors or hardcoded hex values.
4. **Self-Verification**: After writing UI code, run `npx eslint <file>` or check linter output to ensure zero `@shadcn/lint` violations before declaring task completion.
<!-- END:shadcn-lint-rules -->

---

# PayLingo — Project Architecture & Agent Guidelines

**PayLingo** là ứng dụng PWA dịch hội thoại song ngữ real-time 2 chiều giữa người Việt (Host — luôn là Tiếng Việt) và đối tác nước ngoài (Partner — đa ngôn ngữ).

> **LƯU Ý QUAN TRỌNG**: Các tài liệu quy hoạch cũ trong `.planning/` đề cập tới Supabase, Vercel, `@react-pdf/renderer`, `@serwist/next` đã **LỖI THỜI**. Luôn tuân theo kiến trúc thực tế dưới đây.

## 1. Tech Stack & Runtime Thực Tế
- **Framework**: Next.js 16.2 (App Router) + React 19.2 + TypeScript 5.
- **Deployment & Runtime**: **Cloudflare Pages / Workers (Edge Runtime)** qua `@cloudflare/next-on-pages` (`wrangler.toml`).
  - **Mọi API Route (`src/app/api/**/route.ts`) BẮT BUỘC khai báo `export const runtime = 'edge'`**.
  - **KHÔNG** sử dụng các thư viện chỉ chạy trên Node.js hoặc native addon trong API routes. Sử dụng Web Standards API (`fetch`, `crypto.subtle`, `TextEncoder`, `cloudflare:sockets`).
  - Giữ kích thước bundle Edge Worker gọn nhẹ (< 3 MiB sau nén). **KHÔNG** cài thêm thư viện xuất PDF nặng (như `@react-pdf/renderer`, `jspdf`, `puppeteer`) — việc xuất PDF được xử lý qua hộp thoại in A4 native trong `src/lib/pdf-generator.ts`.
- **Database**:
  - **Cloud DB**: **Cloudflare D1 (SQLite)** truy cập qua `getD1()` trong `src/lib/d1-client.ts` (tự động dùng binding `DB` trên Edge và fallback về SQLite cục bộ `.data/paylingo_d1.sqlite` qua `src/lib/d1-local.js` khi chạy dev/test trên Node). Schema chuẩn nằm tại `supabase/d1-schema.sql`.
  - **Client Local-First DB**: **Dexie 4 (IndexedDB)** trong `src/lib/db.ts` (`folders`, `sessions`, `transcriptEntries`).
- **Real-time STT & Translation**:
  - **Soniox WebSocket (`@soniox/react` v2.3, model `stt-rt-v5`)**.
  - Trình duyệt kết nối trực tiếp tới `wss://stt-rt.soniox.com` bằng **temporary API key** (60s, single-use) được cấp từ `POST /api/auth/soniox-key`. Không bao giờ để lộ `SONIOX_API_KEY` xuống client.
  - Hỗ trợ 3 chế độ trong `src/app/session/page.tsx`: `scribe` (chỉ ghi âm), `one_way` (dịch 1 chiều sang Tiếng Việt), `two_way` (dịch song ngữ 2 chiều). Logic ghép câu, khử từ đệm (`uh`, `ờ`, `ừm`...) và tạo UUID định danh nằm tại `src/lib/soniox-parser.ts`.
- **Mobile App (`paylingo-mobile/`)**:
  - Dự án Kotlin Multiplatform (Android/iOS) độc lập nằm trong `paylingo-mobile/`, đã được loại trừ khỏi ESLint và Next.js build. Không sửa đổi trừ khi được yêu cầu rõ.

## 2. Cơ Chế Đồng Bộ Local-First (`src/lib/sync-manager.ts`)
- Mọi thay đổi trong phiên hội thoại phải ghi vào **IndexedDB (Dexie)** trước với `sync_status: 'pending'`.
- Đồng bộ lên Cloudflare D1 qua `POST /api/sync` theo cơ chế batch (tối đa 100 folders/sessions, 500 transcript entries mỗi lần; phía server ghi theo chunk 50 lệnh bằng `db.batch()`).
- **TUYỆT ĐỐI KHÔNG** gọi `syncPendingData()` trên mỗi token streaming real-time để tránh nghẽn mạng và tốn băng thông D1. Chỉ đồng bộ định kỳ mỗi 15 giây khi online, khi có sự kiện `online`, hoặc khi kết thúc phiên (`stopSession`).

## 3. Xác Thực & Bảo Mật (Dual Auth System)
1. **User Auth (Passwordless Email OTP & Magic Link)**:
   - Xử lý tại `src/lib/auth/session.ts`, `src/lib/auth/smtp.ts` và `src/app/api/auth/{send-magic-link,verify,me,signout}`.
   - Gửi email qua giao thức SMTP trực tiếp bằng `cloudflare:sockets` trên Edge (hoặc `node:tls` ở local).
   - Lưu phiên trong bảng D1 `auth_sessions` và cookie `HttpOnly` tên `paylingo_auth_session`. Phía client gọi qua `authClient` (`src/lib/auth-client.ts`).
2. **Admin Auth (`/kulam` & `/api/auth/admin`, `/api/admin/*`)**:
   - Xử lý độc lập tại `src/lib/admin-auth.ts`, dùng mật khẩu băm `PBKDF2-SHA256` (100.000 vòng lặp) + chữ ký `HMAC-SHA256` (cần biến môi trường `ADMIN_SESSION_SECRET` ≥ 32 ký tự) và hỗ trợ **WebAuthn Passkey (ECDSA P-256)**.
   - Cookie phiên quản trị là `admin_session` (`SameSite=Strict`, `HttpOnly`, `Secure`).
3. **Quy tắc bảo mật bắt buộc**:
   - **Không lưu trữ âm thanh (Zero Audio Retention)**: Chỉ lưu văn bản transcript, không bao giờ ghi hay upload file audio của người dùng.
   - **Kiểm tra quyền sở hữu (`owner_id`)**: Mọi truy vấn đọc/ghi/xóa `folders`, `sessions`, `transcript_entries`, `session_summaries` trên D1 phải kiểm tra `owner_id = user.id` (sử dụng prepared statements `.prepare(...).bind(...)`, tuyệt đối không nối chuỗi SQL).
   - **Chống SSRF & XSS**:
     - Khi gọi AI endpoint tùy chỉnh (`/api/ai/summarize`), bắt buộc kiểm tra qua `getSafeAiEndpoint()` trong `src/lib/ai-security.ts`.
     - Khi xuất báo cáo HTML/PDF (`src/lib/pdf-generator.ts`, `src/lib/html-generator.ts`), luôn escape toàn bộ dữ liệu đầu vào.
   - **Rate Limiting**: Áp dụng `checkRateLimit()` (`src/lib/rate-limit.ts`) cho các API nhạy cảm (OTP, verify, Soniox key, AI summarize, xóa tài khoản, đăng nhập Admin).

## 4. Đa Ngôn Ngữ (i18n) & Giao Diện
- Ứng dụng hỗ trợ 3 ngôn ngữ giao diện: Tiếng Việt (`vi` — mặc định), Tiếng Anh (`en`), Tiếng Trung (`zh`) trong `src/lib/i18n.ts`.
- **Quy tắc i18n Parity**: Khi thêm hoặc sửa bất kỳ chuỗi văn bản UI nào trong `src/lib/i18n.ts`, **BẮT BUỘC** cập nhật đầy đủ cả 3 ngôn ngữ (`vi`, `en`, `zh`) với tập key khớp nhau 100% (được kiểm tra tự động bởi `tests/i18n-parity.test.mjs`).
- Hỗ trợ 2 theme: `dark` và `light` (`src/hooks/useTheme.ts`), sử dụng biến màu CSS trong `src/app/globals.css`.

## 5. Lệnh Kiểm Tra & Xác Thực Trước Khi Hoàn Tất Task
Sau khi chỉnh sửa code, luôn chạy các lệnh sau tại thư mục gốc `/Users/kulam/Pay Lingo`:
- **Kiểm tra Lint & Design System (`@shadcn/lint`)**:
  ```bash
  npm run lint
  ```
- **Chạy bộ Unit & Security Regression Tests** (Node test runner):
  ```bash
  npm test
  ```
  *(Bộ test bao gồm: `auth-session-persistence`, `d1-database`, `html-generator`, `i18n-parity`, `pdf-generator`, `security-regressions`, `shared-password`, `soniox-key-security`, `soniox-parser`)*.
- **Kiểm tra Build Next.js / Cloudflare Pages (khi sửa route hoặc cấu hình)**:
  ```bash
  npm run build
  ```
