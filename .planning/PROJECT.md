# PayLingo — App dịch song ngữ real-time

## What This Is

PayLingo là web app PWA hỗ trợ giao tiếp 2 chiều giữa người Việt và đối tác nước ngoài trong các cuộc gặp trực tiếp. Hai khung ngôn ngữ song song hiển thị transcript real-time theo từng "audience": khung A đối tác (đa ngôn ngữ, tự chọn) — khung B của anh (luôn tiếng Việt). Speech-to-text + dịch thực hiện qua Soniox WebSocket streaming, latency ~1-2s.

App phục vụ admin (anh) và một nhóm user được cấp access code; mọi history lưu trên cloud và có thể export PDF.

## Core Value

**Cho phép 2 người không cùng ngôn ngữ trò chuyện trực tiếp mượt mà qua 1 thiết bị**, mỗi người nhìn vào khung của mình và đọc bằng ngôn ngữ mẹ đẻ — không cần phiên dịch viên, không cần thao tác phức tạp.

Tradeoff anchor: nếu phải chọn giữa "nhiều tính năng" và "trải nghiệm hội thoại trực tiếp mượt mà", luôn ưu tiên cái sau.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

**Authentication & access control**
- [ ] Admin (anh) đăng nhập riêng biệt với account đặc quyền
- [ ] Admin tạo / sửa / xóa access code (có label/tên, ngày hết hạn, giới hạn số phút)
- [ ] User nhập access code để vào app, không cần email/password
- [ ] 1 access code dùng được trên không giới hạn thiết bị đồng thời
- [ ] User chỉ thấy history của code mình; admin thấy history toàn bộ

**Speech-to-text + dịch real-time (2 chiều)**
- [ ] Capture audio từ microphone trên trình duyệt (Web Audio API + MediaRecorder)
- [ ] Stream audio đến Soniox WebSocket real-time
- [ ] Khung A: dropdown chọn ngôn ngữ đối tác (8 ngôn ngữ v1: English, 中文, 日本語, 한국어, Español, Русский, Deutsch, ภาษาไทย)
- [ ] Khung B: locked tiếng Việt
- [ ] Auto-route audio sang khung tương ứng dựa trên ngôn ngữ được Soniox detect (Việt → khung B, ngôn ngữ đã chọn → khung A)
- [ ] Mỗi khung hiển thị **chỉ 1 ngôn ngữ** (ngôn ngữ của audience):
  - Khung A luôn hiện ngôn ngữ đối tác (đối tác nói → text gốc; anh nói → text dịch ra ngôn ngữ họ)
  - Khung B luôn hiện tiếng Việt (anh nói → text gốc; đối tác nói → text dịch tiếng Việt)
- [ ] Latency end-to-end ~1-2s, streaming theo từng cụm từ (live caption style)

**Session management**
- [ ] User bấm nút "Start" để bắt đầu 1 session; bấm "Stop" để kết thúc
- [ ] Mỗi session = 1 record trong database, đặt tên tự động theo ngày giờ (user có thể đổi tên sau)
- [ ] Lưu autosave liên tục vào IndexedDB local (chống mất khi crash/disconnect)
- [ ] Khi online, đồng bộ background lên Supabase; có nút "upload" thủ công

**Resilience**
- [ ] Bật Wake Lock API tự động khi đang record để tránh màn hình tự khóa
- [ ] Khi mất mạng giữa session: vẫn record local, hiện indicator "offline", tự reconnect khi có mạng
- [ ] Reload trang giữa session: khôi phục từ IndexedDB, hỏi user có resume hay tạo session mới

**History & export**
- [ ] List history sessions của code đang đăng nhập (theo ngày, có search)
- [ ] Mở session để xem lại transcript (cả 2 khung)
- [ ] Edit transcript sau khi session kết thúc (sửa câu STT nhận sai)
- [ ] Export session ra PDF (cả 2 ngôn ngữ + timestamp)

**Responsive UI + layout switcher**
- [ ] PWA chạy responsive trên mobile / tablet / laptop
- [ ] Icon switch layout: trên/dưới, trái/phải, xoay 180° (cho conversation mode khi đặt máy giữa bàn)
- [ ] Tối ưu cho cả portrait & landscape

**Admin panel**
- [ ] Trang admin riêng, đăng nhập bằng admin credential
- [ ] CRUD access code (tạo, đặt tên, set expire, set giới hạn phút, xóa)
- [ ] Xem & search history của tất cả code (filter theo code, theo ngày, search trong transcript)
- [ ] Dashboard thống kê: tổng phút dùng theo code, ước tính chi phí API tích lũy
- [ ] Export / delete session bất kỳ

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- **Text-to-speech (ElevenLabs hoặc tương đương)** — v1 chỉ hiện text, không phát giọng. Anh đã chọn text-only để đơn giản hóa và tiết kiệm chi phí. Cân nhắc cho v2 nếu use case yêu cầu.
- **Manual override speaker** — anh chọn tin tưởng auto-detect theo ngôn ngữ. Giữ UI tối giản.
- **Online meeting integration (Zoom/Meet/Teams)** — v1 chỉ in-person. Capture audio từ cuộc họp online thuộc use case khác.
- **Video processing** — chỉ audio. Không transcribe video subtitle, không xử lý webcam.
- **Native mobile app (iOS/Android)** — PWA đủ. Native chỉ cần khi muốn record khi màn hình đã khóa (giới hạn của web).
- **Lưu file audio gốc** — chỉ lưu transcript. Privacy hơn, ít storage, đỡ phức tạp.
- **Background recording khi màn khóa** — không khả thi với PWA. Bù lại bằng Wake Lock.
- **Email/password auth** — dùng access code thay vì email/password để đơn giản cho người dùng đối tác doanh nghiệp.
- **Multi-language UI** — UI app dùng tiếng Việt thôi. Đối tác chỉ đọc text trong khung của họ, không cần navigate UI.
- **Tự động phân biệt speaker bằng voice fingerprint** — dùng language detection thay vì voice diarization để giảm latency và tránh training.

## Context

**Bối cảnh sử dụng**:
- Anh có nhu cầu gặp đối tác nước ngoài trực tiếp (business meeting), cần dịch real-time mà không có phiên dịch viên kèm.
- Mỗi cuộc gặp 1 người Việt (anh hoặc nhóm anh) + 1 hoặc nhiều đối tác nước ngoài. Đặt 1 thiết bị giữa bàn / hoặc cầm thiết bị nhỏ giữa hai bên.
- Đa số đối tác sẽ nói các ngôn ngữ business phổ biến (Anh, Trung, Nhật, Hàn, etc.).

**Hệ sinh thái kỹ thuật**:
- Soniox cung cấp real-time multilingual STT + translation built-in, đáp ứng đúng yêu cầu (auto-detect language hint, streaming). Đây là lựa chọn em recommend; em đã confirm với anh trước khi chốt.
- Web Audio API hỗ trợ getUserMedia → MediaStream → có thể stream PCM tới Soniox WebSocket.
- Wake Lock API có sẵn trên Chrome Android và Safari iOS 16.4+.
- Supabase cung cấp Postgres + Auth + Storage trong 1 stack, free tier dùng tốt cho giai đoạn đầu.

**User profile**:
- Admin: anh — control toàn quyền, có chuyên môn business hơn là tech.
- End user: đối tác kinh doanh của anh, mức độ tech khác nhau, cần UI cực đơn giản.

## Constraints

- **Tech stack**: Next.js 15 (App Router) + React 19 + TypeScript + Tailwind + shadcn/ui + Supabase (Postgres/Auth/Storage) + Vercel deploy. Em chọn để tối ưu DX, ecosystem, và time-to-ship.
- **STT/Translation API**: Soniox WebSocket (real-time + translation). API key giữ ở server, không expose client. Anh đã OK với chi phí ~$0.10/phút.
- **Latency target**: end-to-end ≤ 2s từ lúc đối tác nói xong cụm từ đến lúc text hiện lên khung. Streaming partial transcript chấp nhận flicker nhẹ.
- **Performance**: app phải chạy mượt trên mid-range mobile (Android 2-3 năm tuổi). Tránh heavy compute client-side.
- **Privacy**: không lưu audio file. Transcript là dữ liệu nhạy cảm — cần Row-Level Security trên Supabase, access code phải khó đoán.
- **Hosting**: Vercel free tier cho deploy MVP. Supabase free tier (500MB DB, 1GB storage) đủ cho giai đoạn đầu.
- **Browser support**: Chrome/Edge mới (Wake Lock + WebAudio đầy đủ), Safari iOS 16.4+. Không support IE và Safari cũ.

## Key Decisions

<!-- Decisions that constrain future work. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use Soniox cho STT + translation | Multilingual real-time + auto-detect + built-in translation; phù hợp use case nhất; anh đã OK chi phí | — Pending |
| Bỏ TTS (ElevenLabs) khỏi v1 | User chọn output text-only cho đối tác → đơn giản hóa, tiết kiệm chi phí | — Pending |
| Auto-detect speaker bằng language | User trust auto-detect; nhanh, ít UI clutter; rủi ro nhỏ khi anh xen tiếng Anh | — Pending |
| Mỗi khung 1 ngôn ngữ (audience-based) | UX cleaner; mỗi người đọc 1 ngôn ngữ duy nhất giống Google Translate Conversation mode | — Pending |
| Access code thay vì email/password | Đối tác doanh nghiệp dễ vào app hơn, anh control quyền truy cập đơn giản hơn | — Pending |
| 1 code = unlimited devices | Anh ưu tiên đơn giản; không cần chống share code v1 | — Pending |
| Edit transcript chỉ sau session kết thúc | Cân bằng UX: không phức tạp hóa live UI, vẫn fix được STT errors | — Pending |
| Stack Next.js + Supabase + Vercel | Fastest path to ship; ecosystem mature; free tier đủ cho MVP | — Pending |
| PWA only, không native app | PWA + Wake Lock đủ cho use case; native chỉ cần khi record background (out of scope) | — Pending |
| Local-first autosave (IndexedDB) + cloud sync | Chống mất data khi crash/disconnect; user vẫn quyết được khi nào lên cloud | — Pending |
| Layout switcher 3 mode (stack/side-by-side/flipped) | Anh dùng đa thiết bị; conversation mode cần flip 180° khi đặt giữa bàn | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-27 after initialization*
