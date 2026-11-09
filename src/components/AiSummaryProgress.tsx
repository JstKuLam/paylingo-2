'use client'

import { useEffect, useState } from 'react'
import { Check, Clock, Loader2, Sparkles } from 'lucide-react'
import type { Language } from '@/lib/i18n'

interface AiSummaryProgressProps {
  language: Language
  entryCount?: number
  styleLabel?: string
  startedAtMs?: number
}

function computeProgressPercent(elapsedMs: number): number {
  const sec = Math.max(0, elapsedMs / 1000)
  if (sec <= 2.5) {
    return Math.round(12 + (sec / 2.5) * 20) // 12% -> 32%
  }
  if (sec <= 6.5) {
    return Math.round(32 + ((sec - 2.5) / 4) * 26) // 32% -> 58%
  }
  if (sec <= 13) {
    return Math.round(58 + ((sec - 6.5) / 6.5) * 24) // 58% -> 82%
  }
  // Asymptotically approach 96% over longer runs so the bar never freezes
  const extra = 14 * (1 - Math.exp(-(sec - 13) / 14))
  return Math.min(96, Math.round(82 + extra))
}

function getActiveStageIndex(elapsedMs: number): number {
  const sec = Math.max(0, elapsedMs / 1000)
  if (sec < 2.5) return 0
  if (sec < 6.5) return 1
  if (sec < 13) return 2
  return 3
}

function formatElapsedClock(elapsedMs: number): string {
  const totalSec = Math.max(0, Math.floor(elapsedMs / 1000))
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export default function AiSummaryProgress({
  language,
  entryCount = 0,
  styleLabel,
  startedAtMs,
}: AiSummaryProgressProps) {
  const [ anchorMs ] = useState<number>(() => startedAtMs ?? Date.now())
  const effectiveStartMs = startedAtMs ?? anchorMs
  const [nowMs, setNowMs] = useState<number>(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now())
    }, 400)
    return () => window.clearInterval(interval)
  }, [])

  const elapsedMs = Math.max(0, nowMs - effectiveStartMs)
  const progressPct = computeProgressPercent(elapsedMs)
  const activeStage = getActiveStageIndex(elapsedMs)
  const elapsedClock = formatElapsedClock(elapsedMs)

  const countText =
    language === 'en'
      ? entryCount > 0
        ? `${entryCount} conversation segments`
        : 'conversation data'
      : language === 'zh'
        ? entryCount > 0
          ? `${entryCount} 条对话片段`
          : '对话数据'
        : entryCount > 0
          ? `${entryCount} đoạn hội thoại`
          : 'dữ liệu hội thoại'

  const steps =
    language === 'en'
      ? [
          {
            title: 'Syncing & extracting transcript segments',
            desc: `Reading and aligning ${countText} along the timeline`,
          },
          {
            title: 'Normalizing context & identifying speaker roles',
            desc: 'Filtering filler words and mapping Host vs. Partner intents',
          },
          {
            title: 'Synthesizing 7-section executive report',
            desc: 'Extracting clean text, executive summary, decisions, risks & action items',
          },
          {
            title: 'Building Mind Map & polishing document style',
            desc: `Structuring tree hierarchy${styleLabel ? ` in "${styleLabel}" tone` : ''}`,
          },
        ]
      : language === 'zh'
        ? [
            {
              title: '同步并提取对话记录',
              desc: `按时间轴读取并整理 ${countText}`,
            },
            {
              title: '规范化语境与识别说话人角色',
              desc: '过滤语气词，梳理主讲方（Host）与合作方（Partner）核心观点',
            },
            {
              title: '生成 7 项深度执行报告',
              desc: '提炼纯净文本、执行摘要、关键决策、潜在风险与后续行动项',
            },
            {
              title: '绘制思维导图并优化排版',
              desc: `构建树状结构${styleLabel ? `并按“${styleLabel}”风格润色` : ''}`,
            },
          ]
        : [
            {
              title: 'Đồng bộ & trích xuất dữ liệu hội thoại',
              desc: `Đọc và ghép nối ${countText} theo đúng mốc thời gian`,
            },
            {
              title: 'Chuẩn hóa ngữ cảnh & nhận diện người nói',
              desc: 'Khử từ đệm, phân tách luận điểm giữa Bạn (Host) và Đối tác (Partner)',
            },
            {
              title: 'Tổng hợp báo cáo chuyên sâu 7 hạng mục',
              desc: 'Trích xuất văn bản sạch, tóm tắt điều hành, quyết định, rủi ro & việc cần làm',
            },
            {
              title: 'Vẽ sơ đồ tư duy (Mind Map) & hoàn thiện định dạng',
              desc: `Cấu trúc hóa sơ đồ cây${styleLabel ? ` theo phong cách "${styleLabel}"` : ''}`,
            },
          ]

  const headerTitle =
    language === 'en'
      ? 'AI is synthesizing your conversation report'
      : language === 'zh'
        ? 'AI 正在深度生成会议总结报告'
        : 'AI đang tổng hợp báo cáo hội thoại'

  const headerSub =
    language === 'en'
      ? `Processing ${countText}${styleLabel ? ` · Style: ${styleLabel}` : ''}`
      : language === 'zh'
        ? `正在处理 ${countText}${styleLabel ? ` · 风格：${styleLabel}` : ''}`
        : `Đang xử lý ${countText}${styleLabel ? ` · Phong cách: ${styleLabel}` : ''}`

  const doneBadge = language === 'en' ? 'Done' : language === 'zh' ? '已完成' : 'Hoàn tất'
  const activeBadge = language === 'en' ? 'Processing' : language === 'zh' ? '进行中' : 'Đang xử lý'
  const pendingBadge = language === 'en' ? 'Queued' : language === 'zh' ? '等待中' : 'Chờ xử lý'

  const footerHint =
    elapsedMs < 13_000
      ? language === 'en'
        ? 'Deep analysis typically takes 10–25s. Progress is saved in the background—you can switch tabs without restarting.'
        : language === 'zh'
          ? '深度分析通常需要 10–25 秒。进度将在后台自动保持，切换标签页不会重新加载。'
          : 'Phân tích chuyên sâu thường mất 10–25 giây. Tiến trình chạy ngầm và tự động lưu — bạn có thể chuyển tab mà không bị tải lại từ đầu.'
      : language === 'en'
        ? 'Finalizing Mind Map structure and formatting the Markdown report, almost ready...'
        : language === 'zh'
          ? '正在完成思维导图结构与最终排版校对，即将完成...'
          : 'Đang hoàn thiện sơ đồ tư duy (Mind Map) và rà soát định dạng lần cuối, sắp hoàn tất...'

  return (
    <div className="g-card ai-prog" role="status" aria-live="polite" aria-busy="true">
      <div className="ai-prog__head">
        <div className="ai-prog__title-group">
          <span className="ai-prog__orb" aria-hidden="true">
            <Sparkles className="i" />
          </span>
          <div className="ai-prog__titles">
            <strong className="ai-prog__title">{headerTitle}</strong>
            <span className="ai-prog__sub">{headerSub}</span>
          </div>
        </div>

        <div className="ai-prog__metrics">
          <span className="ai-prog__timer" title="Elapsed time">
            <Clock className="i" aria-hidden="true" />
            <span>{elapsedClock}</span>
          </span>
          <span className="ai-prog__pct">{progressPct}%</span>
        </div>
      </div>

      <div className="ai-prog__bar-wrap">
        <progress
          className="ai-prog__bar"
          value={progressPct}
          max={100}
          aria-label={headerTitle}
        />
      </div>

      <ol className="ai-prog__steps">
        {steps.map((step, idx) => {
          const state =
            idx < activeStage ? 'done' : idx === activeStage ? 'active' : 'pending'
          return (
            <li
              key={step.title}
              className={`ai-prog__step ai-prog__step--${state}`}
            >
              <span className="ai-prog__step-icon" aria-hidden="true">
                {state === 'done' ? (
                  <Check className="i" />
                ) : state === 'active' ? (
                  <Loader2 className="i animate-spin" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </span>
              <div className="ai-prog__step-body">
                <div className="ai-prog__step-row">
                  <span className="ai-prog__step-title">{step.title}</span>
                  <span className={`ai-prog__step-badge ai-prog__step-badge--${state}`}>
                    {state === 'done'
                      ? doneBadge
                      : state === 'active'
                        ? activeBadge
                        : pendingBadge}
                  </span>
                </div>
                <p className="ai-prog__step-desc">{step.desc}</p>
              </div>
            </li>
          )
        })}
      </ol>

      <p className="ai-prog__hint">{footerHint}</p>
    </div>
  )
}
