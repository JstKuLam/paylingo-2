import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font, pdf } from '@react-pdf/renderer'
import { LocalTranscriptEntry } from './db'

// Register main font family that covers Latin, Cyrillic, and Vietnamese diacritics
Font.register({
  family: 'NotoSansRegular',
  src: 'https://fonts.gstatic.com/s/notosans/v36/o-0IIpQlx3QUlC5A4PNr5TRA.ttf'
})

// Register Japanese font
Font.register({
  family: 'NotoSansJP',
  src: 'https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFQgg.ttf'
})

// Register Korean font
Font.register({
  family: 'NotoSansKR',
  src: 'https://fonts.gstatic.com/s/notosanskr/v36/PbykF3F2sV8DG3nPPt711nxl.ttf'
})

// Register Simplified Chinese font
Font.register({
  family: 'NotoSansSC',
  src: 'https://fonts.gstatic.com/s/notosanssc/v36/k3kF3F2sV8DG3nPPt711nxl.ttf'
})

// Register Thai font
Font.register({
  family: 'NotoSansThai',
  src: 'https://fonts.gstatic.com/s/notosansthai/v32/Lh9oHzV2sV8DG3nPPt711nxl.ttf'
})

// Font family dynamic mapper based on language code
function getFontFamily(lang: string) {
  switch (lang.toLowerCase()) {
    case 'ja': return 'NotoSansJP'
    case 'ko': return 'NotoSansKR'
    case 'zh': return 'NotoSansSC'
    case 'th': return 'NotoSansThai'
    default: return 'NotoSansRegular'
  }
}

// Styling definitions for react-pdf elements
const styles = StyleSheet.create({
  page: {
    padding: 40,
    backgroundColor: '#ffffff',
  },
  header: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#1e293b',
    paddingBottom: 15,
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f172a',
    fontFamily: 'NotoSansRegular',
  },
  meta: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 6,
    fontFamily: 'NotoSansRegular',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    padding: 8,
    fontWeight: 'bold',
  },
  tableHeaderCol: {
    width: '50%',
    fontSize: 11,
    color: '#475569',
    fontFamily: 'NotoSansRegular',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 10,
    paddingHorizontal: 8,
    minHeight: 35,
  },
  col: {
    width: '50%',
    flexDirection: 'column',
    paddingRight: 10,
  },
  bubble: {
    borderRadius: 8,
    padding: 8,
  },
  hostBubble: {
    backgroundColor: '#f1f5f9',
  },
  partnerBubble: {
    backgroundColor: '#ecfeff',
  },
  text: {
    fontSize: 9.5,
    lineHeight: 1.4,
    color: '#334155',
  },
  speakerLabel: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#64748b',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timestamp: {
    fontSize: 7,
    color: '#94a3b8',
    marginTop: 4,
    textAlign: 'right',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: '#cbd5e1',
    paddingTop: 10,
    textAlign: 'center',
    fontSize: 8,
    color: '#94a3b8',
    fontFamily: 'NotoSansRegular',
  }
})

interface PDFDocProps {
  sessionName: string
  partnerLang: string
  partnerLangName: string
  startedAt: string
  entries: LocalTranscriptEntry[]
}

const PayLingoPDFDocument: React.FC<PDFDocProps> = ({
  sessionName,
  partnerLang,
  partnerLangName,
  startedAt,
  entries
}) => {
  const formattedDate = new Date(startedAt).toLocaleString('vi-VN')
  const partnerFont = getFontFamily(partnerLang)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header Section */}
        <View style={styles.header}>
          <Text style={styles.title}>{sessionName}</Text>
          <Text style={styles.meta}>
            Thời gian bắt đầu: {formattedDate}  |  Ngôn ngữ đối tác: {partnerLangName}
          </Text>
        </View>

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <View style={styles.tableHeaderCol}>
            <Text style={{ fontFamily: 'NotoSansRegular' }}>KHUNG CỦA BẠN (TIẾNG VIỆT)</Text>
          </View>
          <View style={styles.tableHeaderCol}>
            <Text style={{ fontFamily: partnerFont }}>KHUNG ĐỐI TÁC ({partnerLangName.toUpperCase()})</Text>
          </View>
        </View>

        {/* Conversation Rows */}
        {entries.map((entry) => {
          const timestamp = new Date(entry.start_ms).toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          })

          return (
            <View key={entry.id} style={styles.row} wrap={false}>
              {/* Host Column (always Vietnamese) */}
              <View style={styles.col}>
                <View style={[styles.bubble, entry.speaker === 'host' ? styles.hostBubble : {}]}>
                  <Text style={[styles.speakerLabel, { fontFamily: 'NotoSansRegular' }]}>
                    {entry.speaker === 'host' ? 'Bạn' : `${partnerLangName} (Dịch)`}
                  </Text>
                  <Text style={[styles.text, { fontFamily: 'NotoSansRegular' }]}>
                    {entry.speaker === 'host' ? entry.original_text : entry.translated_text}
                  </Text>
                  <Text style={[styles.timestamp, { fontFamily: 'NotoSansRegular' }]}>{timestamp}</Text>
                </View>
              </View>

              {/* Partner Column (always partner language) */}
              <View style={styles.col}>
                <View style={[styles.bubble, entry.speaker === 'partner' ? styles.partnerBubble : {}]}>
                  <Text style={[styles.speakerLabel, { fontFamily: partnerFont }]}>
                    {entry.speaker === 'partner' ? partnerLangName : 'Host (Dịch)'}
                  </Text>
                  <Text style={[styles.text, { fontFamily: partnerFont }]}>
                    {entry.speaker === 'partner' ? entry.original_text : entry.translated_text}
                  </Text>
                  <Text style={[styles.timestamp, { fontFamily: partnerFont }]}>{timestamp}</Text>
                </View>
              </View>
            </View>
          )
        })}

        {/* Footer Page Number */}
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Trang ${pageNumber} / ${totalPages}  |  PayLingo - 2-Way Realtime Bilingual Translator`}
          fixed
        />
      </Page>
    </Document>
  )
}

/**
 * Trigger client-side PDF compilation and download.
 */
export async function downloadSessionPDF(
  sessionName: string,
  partnerLang: string,
  partnerLangName: string,
  startedAt: string,
  entries: LocalTranscriptEntry[]
) {
  const doc = (
    <PayLingoPDFDocument
      sessionName={sessionName}
      partnerLang={partnerLang}
      partnerLangName={partnerLangName}
      startedAt={startedAt}
      entries={entries}
    />
  )

  const blob = await pdf(doc).toBlob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${sessionName.replace(/\s+/g, '_')}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
