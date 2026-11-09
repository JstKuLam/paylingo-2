# PayLingo — Project Instructions

See [`AGENTS.md`](./AGENTS.md) for the authoritative project architecture, design system rules (`@shadcn/lint`), security invariants, and verification commands.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**PayLingo — App dịch song ngữ real-time**

PayLingo là web app PWA hỗ trợ giao tiếp 2 chiều giữa người Việt và đối tác nước ngoài trong các cuộc gặp trực tiếp. Hai khung ngôn ngữ song song hiển thị transcript real-time theo từng "audience": khung A đối tác (đa ngôn ngữ, tự chọn) — khung B của chủ phòng (luôn tiếng Việt). Speech-to-text + dịch thực hiện qua Soniox WebSocket streaming (`stt-rt-v5`), latency ~1-2s.

**Core Value:** **Cho phép 2 người không cùng ngôn ngữ trò chuyện trực tiếp mượt mà qua 1 thiết bị**, mỗi người nhìn vào khung của mình và đọc bằng ngôn ngữ mẹ đẻ — không cần phiên dịch viên, không cần thao tác phức tạp.

### Current Architecture & Constraints (v3.3.0+)

- **Tech stack**: Next.js 16.2 (App Router) + React 19.2 + TypeScript 5 + Tailwind CSS v4 + shadcn/ui (`base-nova`, `@base-ui/react`) + **Cloudflare D1 (SQLite)** + `@soniox/react` 2.3 + Dexie 4 (IndexedDB) + **Cloudflare Pages / Workers (`@cloudflare/next-on-pages`, Edge Runtime)**.
- **Runtime**: Tất cả API Route Handlers (`src/app/api/**/route.ts`) chạy trên **Edge Runtime (`export const runtime = 'edge'`)**. Không dùng thư viện Node-only hoặc native bindings.
- **Database & Local-First Sync**:
  - Client lưu trữ tức thì vào IndexedDB (Dexie — `src/lib/db.ts`) và đồng bộ theo lô (batch 15s / khi kết thúc phiên) lên Cloudflare D1 qua `POST /api/sync` (`src/lib/sync-manager.ts`).
  - Truy cập D1 trên server qua `getD1()` (`src/lib/d1-client.ts`), schema chuẩn tại `supabase/d1-schema.sql`.
- **Authentication**:
  - **User Auth**: Passwordless Email OTP (6 số) & Magic Link qua SMTP (`cloudflare:sockets` / `node:tls` trong `src/lib/auth/smtp.ts`), lưu session tại bảng D1 `auth_sessions` (`paylingo_auth_session` HttpOnly cookie).
  - **Admin Auth (`/kulam`)**: PBKDF2-SHA256 + HMAC-SHA256 session (`admin_session` cookie) + WebAuthn Passkey (ECDSA P-256) trong `src/lib/admin-auth.ts`.
- **STT/Translation API**: Soniox WebSocket (`stt-rt-v5`, hỗ trợ `scribe`, `one_way`, `two_way`). Trình duyệt kết nối trực tiếp tới `wss://stt-rt.soniox.com` qua temporary API key cấp từ `POST /api/auth/soniox-key`.
- **Export & AI**:
  - Xuất PDF qua hộp thoại in A4 native của trình duyệt (`src/lib/pdf-generator.ts`) để giữ kích thước Edge Worker < 3 MiB (không dùng `@react-pdf/renderer`). Hỗ trợ xuất HTML, TXT, JSON.
  - Tóm tắt AI (`POST /api/ai/summarize`) có kiểm tra SSRF allowlist (`src/lib/ai-security.ts`) và chia sẻ bản tóm tắt có bảo vệ mật khẩu PBKDF2 (`src/lib/shared-password.ts`).
- **Privacy**: Không lưu file audio (Zero Audio Retention). Mọi truy vấn dữ liệu trên D1 bắt buộc kiểm tra `owner_id = user.id`.
<!-- GSD:project-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions & Verification

1. **Design System (`@shadcn/lint`)**: Tuân thủ nghiêm ngặt các quy tắc trong `AGENTS.md` (không restyle core components, không dùng arbitrary Tailwind values, chỉ dùng theme color tokens trong `src/app/globals.css`).
2. **i18n Parity (`src/lib/i18n.ts`)**: Mọi key ngôn ngữ phải đồng bộ 100% giữa `vi`, `en`, và `zh`.
3. **Verification**: Luôn chạy `npm run lint` và `npm test` sau khi thay đổi code.
<!-- GSD:conventions-end -->
