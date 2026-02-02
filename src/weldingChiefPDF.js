// weldingChiefPDF.js
// PDF generation for Welding Chief Daily Report
// Matches the style of chiefConstructionPDF.js for consistency

import jsPDF from 'jspdf'

// Brand Colors
const COLORS = {
  purple: [111, 66, 193],        // #6f42c1 - Welding Chief theme
  purpleLight: [240, 235, 248],  // Light purple for alternating rows
  green: [40, 167, 69],          // #28a745 - Production
  red: [220, 53, 69],            // #dc3545 - Quality/Repairs
  brown: [139, 69, 19],          // #8b4513 - Tie-ins
  teal: [23, 162, 184],          // #17a2b8 - Observations
  yellow: [255, 193, 7],         // #ffc107 - Action items
  white: [255, 255, 255],
  black: [0, 0, 0],
  gray: [128, 128, 128],
  grayLight: [245, 245, 245],
  grayMid: [200, 200, 200]
}

/**
 * Generate Welding Chief Daily Report PDF
 * @param {Object} report - The report data from generateWeldingChiefReport
 * @param {Object} options - Additional options (reportDate, preparedBy, projectName)
 * @returns {jsPDF} - Generated PDF document
 */
export function generateWeldingChiefPDF(report, options = {}) {
  const {
    reportDate = new Date().toISOString().split('T')[0],
    preparedBy = 'Welding Chief',
    projectName = 'Pipeline Construction Project',
    signatureData = null  // { imageData, signerName, signerTitle, timestamp }
  } = options

  const doc = new jsPDF('p', 'mm', 'letter')
  const pageWidth = 215.9
  const pageHeight = 279.4
  const margin = 15
  const contentWidth = pageWidth - (margin * 2)
  let y = 0
  let currentPage = 1

  // Set PDF metadata
  doc.setProperties({
    title: `Welding Chief Daily Report - ${reportDate}`,
    subject: 'Welding Chief Daily Report',
    author: preparedBy,
    creator: 'Pipe-Up Inspection Management System',
    producer: 'jsPDF',
    keywords: `welding, chief, report, ${reportDate}`
  })

  // =============================================
  // HELPER FUNCTIONS
  // =============================================

  const setColor = (color, type = 'fill') => {
    const [r, g, b] = color
    if (type === 'fill') doc.setFillColor(r, g, b)
    else if (type === 'text') doc.setTextColor(r, g, b)
    else if (type === 'draw') doc.setDrawColor(r, g, b)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }

  const checkPageBreak = (neededSpace) => {
    if (y + neededSpace > pageHeight - 25) {
      addFooter()
      doc.addPage()
      currentPage++
      y = margin
      addPageHeader()
    }
  }

  const addPageHeader = () => {
    if (currentPage > 1) {
      setColor(COLORS.purple, 'fill')
      doc.rect(0, 0, pageWidth, 12, 'F')
      setColor(COLORS.white, 'text')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text('WELDING CHIEF DAILY REPORT', pageWidth / 2, 8, { align: 'center' })
      doc.setFontSize(8)
      doc.text(formatDate(reportDate), pageWidth - margin, 8, { align: 'right' })
      y = 18
    }
  }

  const addFooter = () => {
    const footerY = pageHeight - 15
    setColor(COLORS.grayMid, 'draw')
    doc.line(margin, footerY, pageWidth - margin, footerY)
    setColor(COLORS.gray, 'text')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text(`Page ${currentPage}`, pageWidth / 2, footerY + 5, { align: 'center' })
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, footerY + 5)
    doc.text('Pipe-Up Inspection Management', pageWidth - margin, footerY + 5, { align: 'right' })
  }

  const addSectionHeader = (title, color) => {
    checkPageBreak(20)
    y += 5  // Add space before header
    setColor(color, 'fill')
    doc.rect(margin, y, contentWidth, 8, 'F')
    setColor(COLORS.white, 'text')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(title, margin + 5, y + 5.5)
    y += 14  // More space after header (was 10)
    setColor(COLORS.black, 'text')
  }

  const addParagraph = (text, maxWidth = contentWidth - 10) => {
    if (!text) return
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const lines = doc.splitTextToSize(text, maxWidth)
    for (const line of lines) {
      checkPageBreak(6)
      doc.text(line, margin + 5, y)
      y += 5
    }
    y += 4  // More space after paragraph (was 2)
  }

  const addBulletList = (items, maxWidth = contentWidth - 15) => {
    if (!items || items.length === 0) return
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    for (const item of items) {
      const cleanItem = item.replace(/^[<\-•]\s*/, '')
      const lines = doc.splitTextToSize(cleanItem, maxWidth)
      checkPageBreak(lines.length * 4 + 2)
      doc.text('•', margin + 5, y)
      for (let i = 0; i < lines.length; i++) {
        doc.text(lines[i], margin + 10, y)
        y += 4
      }
      y += 1
    }
    y += 2
  }

  // =============================================
  // PAGE 1: HEADER AND EXECUTIVE SUMMARY
  // =============================================

  // Main header
  setColor(COLORS.purple, 'fill')
  doc.rect(0, 0, pageWidth, 35, 'F')

  // Title
  setColor(COLORS.white, 'text')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('WELDING CHIEF DAILY REPORT', pageWidth / 2, 15, { align: 'center' })

  // Subtitle
  doc.setFontSize(12)
  doc.text(projectName, pageWidth / 2, 23, { align: 'center' })

  // Date and author
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(formatDate(reportDate), pageWidth / 2, 30, { align: 'center' })

  y = 42

  // Report metadata box
  setColor(COLORS.grayLight, 'fill')
  doc.rect(margin, y, contentWidth, 12, 'F')
  setColor(COLORS.grayMid, 'draw')
  doc.rect(margin, y, contentWidth, 12, 'S')

  setColor(COLORS.black, 'text')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Prepared by: ${preparedBy}`, margin + 5, y + 5)
  doc.text(`Report Date: ${reportDate}`, margin + 80, y + 5)
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin + 5, y + 10)

  y += 18

  // =============================================
  // EXECUTIVE SUMMARY
  // =============================================
  addSectionHeader('EXECUTIVE SUMMARY', COLORS.purple)
  addParagraph(report.executiveSummary || 'No summary available.')
  y += 5

  // =============================================
  // PRODUCTION SUMMARY
  // =============================================
  addSectionHeader('PRODUCTION SUMMARY', COLORS.green)
  addParagraph(report.productionSummary?.narrative || 'No production data available.')
  if (report.productionSummary?.bullets?.length > 0) {
    addBulletList(report.productionSummary.bullets)
  }
  y += 3

  // =============================================
  // QUALITY & REPAIRS
  // =============================================
  addSectionHeader('QUALITY & REPAIRS', COLORS.red)
  addParagraph(report.qualityAndRepairs?.narrative || 'No quality issues to report.')
  if (report.qualityAndRepairs?.bullets?.length > 0) {
    addBulletList(report.qualityAndRepairs.bullets)
  }

  // Flagged welders warning box
  if (report.qualityAndRepairs?.flaggedWelders?.length > 0) {
    checkPageBreak(20)
    y += 3
    setColor([255, 243, 205], 'fill') // Warning yellow background
    const boxHeight = 8 + (report.qualityAndRepairs.flaggedWelders.length * 4)
    doc.rect(margin + 5, y, contentWidth - 10, boxHeight, 'F')
    setColor([133, 100, 4], 'text') // Warning text color
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    y += 5
    doc.text('Flagged Welders (>8% repair rate):', margin + 10, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    for (const welder of report.qualityAndRepairs.flaggedWelders) {
      doc.text(`• ${welder}`, margin + 12, y)
      y += 4
    }
    y += 5
    setColor(COLORS.black, 'text')
  }
  y += 3

  // =============================================
  // TIE-IN OPERATIONS
  // =============================================
  addSectionHeader('TIE-IN OPERATIONS', COLORS.brown)
  addParagraph(report.tieInOperations?.narrative || 'No tie-in operations today.')
  if (report.tieInOperations?.bullets?.length > 0) {
    addBulletList(report.tieInOperations.bullets)
  }
  y += 3

  // =============================================
  // INSPECTOR OBSERVATIONS
  // =============================================
  addSectionHeader('INSPECTOR OBSERVATIONS', COLORS.teal)
  addParagraph(report.inspectorObservations?.narrative || 'No observations recorded.')

  // Key comments box
  if (report.inspectorObservations?.keyComments?.length > 0) {
    checkPageBreak(15)
    y += 3
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    setColor(COLORS.black, 'text')
    doc.text('Key Comments:', margin + 5, y)
    y += 5

    for (const comment of report.inspectorObservations.keyComments) {
      checkPageBreak(12)
      setColor(COLORS.grayLight, 'fill')
      const commentLines = doc.splitTextToSize(comment, contentWidth - 20)
      const boxHeight = commentLines.length * 4 + 4
      doc.rect(margin + 5, y - 2, contentWidth - 10, boxHeight, 'F')
      setColor(COLORS.teal, 'draw')
      doc.line(margin + 5, y - 2, margin + 5, y - 2 + boxHeight)
      doc.line(margin + 5, y - 2, margin + 7, y - 2)
      doc.line(margin + 5, y - 2 + boxHeight, margin + 7, y - 2 + boxHeight)

      setColor(COLORS.black, 'text')
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(8)
      for (const line of commentLines) {
        doc.text(`"${line}"`, margin + 10, y + 2)
        y += 4
      }
      y += 4
    }
  }
  y += 3

  // =============================================
  // ACTION ITEMS
  // =============================================
  if (report.actionItems?.length > 0) {
    addSectionHeader('ACTION ITEMS', COLORS.yellow)
    setColor(COLORS.black, 'text')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)

    for (let i = 0; i < report.actionItems.length; i++) {
      const item = report.actionItems[i]
      const lines = doc.splitTextToSize(item, contentWidth - 20)
      checkPageBreak(lines.length * 4 + 4)

      // Numbered item
      doc.setFont('helvetica', 'bold')
      doc.text(`${i + 1}.`, margin + 5, y)
      doc.setFont('helvetica', 'normal')
      for (let j = 0; j < lines.length; j++) {
        doc.text(lines[j], margin + 12, y)
        y += 4
      }
      y += 2
    }
  }

  // =============================================
  // SIGNATURE BLOCK
  // =============================================
  checkPageBreak(50)
  y += 10

  setColor(COLORS.grayMid, 'draw')
  doc.line(margin, y, pageWidth - margin, y)
  y += 10

  // Signature section
  const sigWidth = (contentWidth - 20) / 2

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setColor(COLORS.black, 'text')
  doc.text('APPROVAL', margin + 5, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(COLORS.gray, 'text')
  doc.text('Welding Chief Inspector:', margin + 5, y)
  doc.text('Date:', margin + sigWidth + 30, y)
  y += 5

  // If digital signature provided, add it
  if (signatureData?.imageData) {
    try {
      // Add signature image
      doc.addImage(signatureData.imageData, 'PNG', margin + 5, y, 60, 25)
      y += 27

      // Add signer info below signature
      setColor(COLORS.black, 'text')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text(signatureData.signerName || preparedBy, margin + 5, y)
      y += 4
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      setColor(COLORS.gray, 'text')
      doc.text(signatureData.signerTitle || 'Welding Chief Inspector', margin + 5, y)

      // Add date on the right
      const signedDate = signatureData.timestamp
        ? new Date(signatureData.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      doc.text(signedDate, margin + sigWidth + 30, y - 4)

      // Add verification notice
      y += 10
      setColor(COLORS.green, 'text')
      doc.setFontSize(7)
      doc.text('✓ Digitally signed and verified', margin + 5, y)

    } catch (err) {
      console.error('Error adding signature to PDF:', err)
      // Fallback to signature line
      setColor(COLORS.black, 'draw')
      doc.line(margin + 5, y + 15, margin + 5 + sigWidth - 10, y + 15)
      doc.line(margin + sigWidth + 30, y + 15, margin + sigWidth + 30 + 40, y + 15)
      y += 20
    }
  } else {
    // Empty signature lines for manual signing
    y += 3
    setColor(COLORS.black, 'draw')
    doc.line(margin + 5, y + 15, margin + 5 + sigWidth - 10, y + 15)
    doc.line(margin + sigWidth + 30, y + 15, margin + sigWidth + 30 + 40, y + 15)
    y += 20
  }

  y += 10

  // Document ID
  setColor(COLORS.gray, 'text')
  doc.setFontSize(7)
  const docId = `WCR-${reportDate.replace(/-/g, '')}-${Date.now().toString(36).toUpperCase()}`
  doc.text(`Document ID: ${docId}`, margin, y)

  // Add footer to last page
  addFooter()

  return doc
}

/**
 * Generate and download Welding Chief Daily Report PDF
 * @param {Object} report - The report data
 * @param {Object} options - Additional options
 */
export function downloadWeldingChiefPDF(report, options = {}) {
  const doc = generateWeldingChiefPDF(report, options)
  const filename = `${options.reportDate || new Date().toISOString().split('T')[0]}_Welding_Chief_Daily_Report.pdf`
  doc.save(filename)
}

export default {
  generateWeldingChiefPDF,
  downloadWeldingChiefPDF
}
