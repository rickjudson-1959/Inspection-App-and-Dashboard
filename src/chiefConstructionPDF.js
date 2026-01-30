// chiefConstructionPDF.js
// PDF generation for Legacy EGP Daily Construction Summary Report format
// Matches exactly: Legacy Chief Reports/01-12-2026 Construction Summary Report KF.pdf

import jsPDF from 'jspdf'

// EGP Brand Colors
const COLORS = {
  egpGreen: [26, 95, 42],       // #1a5f2a - Header bar
  egpGreenLight: [220, 242, 220], // Light green for alternating rows
  white: [255, 255, 255],
  black: [0, 0, 0],
  gray: [128, 128, 128],
  grayLight: [245, 245, 245],
  grayMid: [200, 200, 200],
  red: [220, 53, 69],
  blue: [0, 123, 255],
  yellow: [255, 193, 7]
}

/**
 * Generate EGP Daily Construction Summary Report PDF
 * @param {Object} data - All report data
 * @returns {jsPDF} - Generated PDF document
 */
export function generateEGPConstructionPDF(data) {
  const {
    reportDate,
    reportNumber,
    projectName = 'Eagle Mountain Pipeline Project',
    contractor = 'SMJV',
    reportedBy = 'Chief Inspector',
    keyFocusBullets = [],
    todaysProgress = '0.00%',
    safetyStatus = '',
    personnel = {},
    weather = {},
    progressData = {},
    weldingData = {},
    selectedPhotos = [],
    leadInspector = '',
    constructionManager = ''
  } = data

  const doc = new jsPDF('p', 'mm', 'letter')
  const pageWidth = 215.9
  const pageHeight = 279.4
  const margin = 10
  const contentWidth = pageWidth - (margin * 2)
  let y = 0
  let currentPage = 1

  // Generate document ID and hash
  const documentId = `${reportDate?.replace(/-/g, '')}DPR`
  const generationTimestamp = new Date().toISOString()

  // Set PDF metadata
  doc.setProperties({
    title: `Daily Construction Summary Report - ${reportDate}`,
    subject: 'EGP Daily Construction Summary Report',
    author: reportedBy,
    creator: 'Pipe-Up Inspection Management System',
    producer: 'jsPDF',
    keywords: `EGP, construction, ${reportDate}, ${documentId}`
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

  const formatKP = (value) => {
    if (!value) return '-'
    return String(value)
  }

  const formatNumber = (value, decimals = 0) => {
    if (value === null || value === undefined || value === '') return '-'
    const num = parseFloat(value)
    if (isNaN(num)) return '-'
    if (num === 0) return '-'
    return num.toFixed(decimals)
  }

  const addPageHeader = () => {
    // FORTIS BC header area (top left)
    setColor(COLORS.white, 'fill')
    doc.rect(0, 0, pageWidth, 8, 'F')
    setColor(COLORS.black, 'text')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('FORTIS BC', margin, 5)

    // Project title bar
    setColor(COLORS.black, 'text')
    doc.setFontSize(9)
    doc.text('EAGLE MOUNTAIN - WOODFIBRE GAS PIPELINE PROJECT', pageWidth / 2, 5, { align: 'center' })

    y = 10
  }

  const addReportTitle = () => {
    // Title bar
    setColor(COLORS.grayLight, 'fill')
    doc.rect(margin, y, contentWidth, 8, 'F')
    setColor(COLORS.grayMid, 'draw')
    doc.rect(margin, y, contentWidth, 8, 'S')

    setColor(COLORS.black, 'text')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('DAILY CONSTRUCTION SUMMARY REPORT (EGP)', pageWidth / 2, y + 5.5, { align: 'center' })
    y += 10

    // Report metadata row
    const metaY = y
    const colWidth = contentWidth / 4

    // Report Date
    setColor(COLORS.grayLight, 'fill')
    doc.rect(margin, metaY, colWidth * 2, 10, 'F')
    setColor(COLORS.grayMid, 'draw')
    doc.rect(margin, metaY, colWidth * 2, 5, 'S')
    doc.rect(margin, metaY + 5, colWidth * 2, 5, 'S')

    setColor(COLORS.black, 'text')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text('Report Date', margin + 2, metaY + 3.5)
    doc.text('Project', margin + 2, metaY + 8.5)
    doc.text('Reported By', margin + 2 + colWidth, metaY + 8.5)

    doc.setFont('helvetica', 'bold')
    doc.text(formatDate(reportDate), margin + 25, metaY + 3.5)
    doc.text(projectName, margin + 25, metaY + 8.5)
    doc.text(reportedBy, margin + 25 + colWidth, metaY + 8.5)

    // Report Number
    doc.rect(margin + colWidth * 2, metaY, colWidth * 2, 10, 'F')
    doc.rect(margin + colWidth * 2, metaY, colWidth * 2, 5, 'S')
    doc.rect(margin + colWidth * 2, metaY + 5, colWidth * 2, 5, 'S')

    doc.setFont('helvetica', 'normal')
    doc.text('Report Number', margin + colWidth * 2 + 2, metaY + 3.5)
    doc.text('Contractor', margin + colWidth * 2 + 2, metaY + 8.5)

    doc.setFont('helvetica', 'bold')
    doc.text(documentId, margin + colWidth * 2 + 30, metaY + 3.5)
    doc.text(contractor, margin + colWidth * 2 + 30, metaY + 8.5)

    y = metaY + 12
  }

  const addSectionHeader = (title, bgColor = COLORS.egpGreen) => {
    setColor(bgColor, 'fill')
    doc.rect(margin, y, contentWidth, 5, 'F')
    setColor(COLORS.white, 'text')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(title, margin + 2, y + 3.5)
    y += 6
  }

  const checkPageBreak = (neededSpace = 20) => {
    if (y > pageHeight - neededSpace - 15) {
      addFooter()
      doc.addPage()
      currentPage++
      addPageHeader()
      return true
    }
    return false
  }

  const addFooter = () => {
    const footerY = pageHeight - 8
    setColor(COLORS.gray, 'text')
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.text('EGP_Daily_Progress_Report', margin, footerY)
    doc.text(`Page ${currentPage} of 2`, pageWidth - margin, footerY, { align: 'right' })
  }

  // =============================================
  // PAGE 1 - SUMMARY & PROGRESS
  // =============================================

  addPageHeader()
  addReportTitle()

  // SECTION 1 - SUMMARY
  addSectionHeader('SECTION 1 - SUMMARY')

  // Key Focus of the Day
  const keyFocusStartY = y
  const keyFocusWidth = contentWidth * 0.75

  setColor(COLORS.grayLight, 'fill')
  doc.rect(margin, y, keyFocusWidth, 5, 'F')
  setColor(COLORS.grayMid, 'draw')
  doc.rect(margin, y, keyFocusWidth, 5, 'S')

  setColor(COLORS.black, 'text')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('Key Focus of the day', margin + 2, y + 3.5)
  y += 5

  // Key Focus bullets
  const bulletAreaHeight = Math.max(35, keyFocusBullets.length * 4 + 5)
  setColor(COLORS.white, 'fill')
  doc.rect(margin, y, keyFocusWidth, bulletAreaHeight, 'F')
  setColor(COLORS.grayMid, 'draw')
  doc.rect(margin, y, keyFocusWidth, bulletAreaHeight, 'S')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  let bulletY = y + 4
  keyFocusBullets.forEach(bullet => {
    const text = bullet.startsWith('<') ? bullet : `< ${bullet}`
    const lines = doc.splitTextToSize(text, keyFocusWidth - 6)
    lines.forEach(line => {
      if (bulletY < y + bulletAreaHeight - 2) {
        doc.text(line, margin + 2, bulletY)
        bulletY += 3.5
      }
    })
  })

  // Today's Progress box (right side)
  const progressBoxX = margin + keyFocusWidth
  const progressBoxWidth = contentWidth - keyFocusWidth
  const progressBoxHeight = bulletAreaHeight + 5

  setColor(COLORS.grayLight, 'fill')
  doc.rect(progressBoxX, keyFocusStartY, progressBoxWidth, 5, 'F')
  setColor(COLORS.grayMid, 'draw')
  doc.rect(progressBoxX, keyFocusStartY, progressBoxWidth, progressBoxHeight, 'S')
  doc.rect(progressBoxX, keyFocusStartY, progressBoxWidth, 5, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setColor(COLORS.black, 'text')
  doc.text("Today's Progress", progressBoxX + 2, keyFocusStartY + 3.5)

  // Large progress percentage
  doc.setFontSize(16)
  doc.text(todaysProgress, progressBoxX + progressBoxWidth / 2, keyFocusStartY + 25, { align: 'center' })

  y += bulletAreaHeight + 2

  // Safety Status row
  setColor(COLORS.grayLight, 'fill')
  doc.rect(margin, y, contentWidth, 5, 'F')
  setColor(COLORS.grayMid, 'draw')
  doc.rect(margin, y, contentWidth, 5, 'S')

  setColor(COLORS.black, 'text')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('Safety Status', margin + 2, y + 3.5)
  y += 6

  // Personnel Onsite Grid
  setColor(COLORS.grayLight, 'fill')
  doc.rect(margin, y, contentWidth, 5, 'F')
  setColor(COLORS.grayMid, 'draw')
  doc.rect(margin, y, contentWidth, 5, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('Personnel Onsite', margin + 2, y + 3.5)
  y += 5

  // Personnel grid - Row 1
  const personColWidth = contentWidth / 5
  const gridStartY = y

  // Headers row
  const personnelHeaders = ['Prime Resources', 'Prime Subcontractors', 'FEI Employee', 'FEI Subcontractors', 'Total Site Exposure']
  setColor(COLORS.grayLight, 'fill')
  personnelHeaders.forEach((header, i) => {
    doc.rect(margin + i * personColWidth, y, personColWidth, 5, 'F')
    setColor(COLORS.grayMid, 'draw')
    doc.rect(margin + i * personColWidth, y, personColWidth, 5, 'S')
    setColor(COLORS.black, 'text')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.text(header, margin + i * personColWidth + 2, y + 3.5)
  })
  y += 5

  // Values row
  const personnelValues = [
    personnel.primeResources || 0,
    personnel.primeSubcontractors || 0,
    personnel.feiEmployee || 0,
    personnel.feiSubcontractors || 0,
    personnel.totalSiteExposure || 0
  ]
  setColor(COLORS.white, 'fill')
  personnelValues.forEach((value, i) => {
    doc.rect(margin + i * personColWidth, y, personColWidth, 5, 'F')
    setColor(COLORS.grayMid, 'draw')
    doc.rect(margin + i * personColWidth, y, personColWidth, 5, 'S')
    setColor(COLORS.black, 'text')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(String(value), margin + i * personColWidth + personColWidth / 2, y + 3.5, { align: 'center' })
  })
  y += 5

  // Breakdown row 1
  const breakdownHeaders1 = ['Decca Inspector', 'Env Inspector', 'Env QP', 'FEI Compliance', 'Engineering']
  setColor(COLORS.grayLight, 'fill')
  breakdownHeaders1.forEach((header, i) => {
    doc.rect(margin + i * personColWidth, y, personColWidth, 5, 'F')
    setColor(COLORS.grayMid, 'draw')
    doc.rect(margin + i * personColWidth, y, personColWidth, 5, 'S')
    setColor(COLORS.black, 'text')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.text(header, margin + i * personColWidth + 2, y + 3.5)
  })
  y += 5

  // Breakdown values 1
  const bd = personnel.breakdown || {}
  const breakdownValues1 = [bd.deccaInspector || 0, bd.envInspector || 0, bd.envQP || 0, bd.feiCompliance || 0, bd.engineering || 0]
  setColor(COLORS.white, 'fill')
  breakdownValues1.forEach((value, i) => {
    doc.rect(margin + i * personColWidth, y, personColWidth, 5, 'F')
    setColor(COLORS.grayMid, 'draw')
    doc.rect(margin + i * personColWidth, y, personColWidth, 5, 'S')
    setColor(COLORS.black, 'text')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(String(value), margin + i * personColWidth + personColWidth / 2, y + 3.5, { align: 'center' })
  })
  y += 5

  // Breakdown row 2
  const breakdownHeaders2 = ['Meridian-Survey', 'FEI OPS', 'NDT', 'Other', '']
  setColor(COLORS.grayLight, 'fill')
  breakdownHeaders2.forEach((header, i) => {
    doc.rect(margin + i * personColWidth, y, personColWidth, 5, 'F')
    setColor(COLORS.grayMid, 'draw')
    doc.rect(margin + i * personColWidth, y, personColWidth, 5, 'S')
    if (header) {
      setColor(COLORS.black, 'text')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6)
      doc.text(header, margin + i * personColWidth + 2, y + 3.5)
    }
  })
  y += 5

  // Breakdown values 2
  const breakdownValues2 = [bd.meridianSurvey || 0, bd.feiOps || 0, bd.ndt || 0, bd.other || 0, '']
  setColor(COLORS.white, 'fill')
  breakdownValues2.forEach((value, i) => {
    doc.rect(margin + i * personColWidth, y, personColWidth, 5, 'F')
    setColor(COLORS.grayMid, 'draw')
    doc.rect(margin + i * personColWidth, y, personColWidth, 5, 'S')
    if (value !== '') {
      setColor(COLORS.black, 'text')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text(String(value), margin + i * personColWidth + personColWidth / 2, y + 3.5, { align: 'center' })
    }
  })
  y += 6

  // Daily Weather
  setColor(COLORS.grayLight, 'fill')
  doc.rect(margin, y, contentWidth, 5, 'F')
  setColor(COLORS.grayMid, 'draw')
  doc.rect(margin, y, contentWidth, 5, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setColor(COLORS.black, 'text')
  doc.text('Daily Weather', margin + 2, y + 3.5)
  y += 5

  // Weather row
  const weatherCols = contentWidth / 5
  const weatherHeaders = ['Temperature C', 'High', 'Low', 'Right of Way Conditions', 'Weather Conditions', 'Precipitation (mm)']

  setColor(COLORS.grayLight, 'fill')
  doc.rect(margin, y, weatherCols, 5, 'F')
  doc.rect(margin + weatherCols, y, weatherCols / 2, 5, 'F')
  doc.rect(margin + weatherCols * 1.5, y, weatherCols / 2, 5, 'F')
  doc.rect(margin + weatherCols * 2, y, weatherCols, 5, 'F')
  doc.rect(margin + weatherCols * 3, y, weatherCols, 5, 'F')
  doc.rect(margin + weatherCols * 4, y, weatherCols, 5, 'F')

  setColor(COLORS.grayMid, 'draw')
  doc.rect(margin, y, contentWidth, 10, 'S')
  doc.line(margin + weatherCols, y, margin + weatherCols, y + 10)
  doc.line(margin + weatherCols * 2, y, margin + weatherCols * 2, y + 10)
  doc.line(margin + weatherCols * 3, y, margin + weatherCols * 3, y + 10)
  doc.line(margin + weatherCols * 4, y, margin + weatherCols * 4, y + 10)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  setColor(COLORS.black, 'text')
  doc.text('Temperature C', margin + 2, y + 3.5)
  doc.text('High', margin + weatherCols + 2, y + 3.5)
  doc.text('Low', margin + weatherCols * 1.5 + 2, y + 3.5)
  doc.text('Right of Way Conditions', margin + weatherCols * 2 + 2, y + 3.5)
  doc.text('Weather Conditions', margin + weatherCols * 3 + 2, y + 3.5)
  doc.text('Precipitation (mm)', margin + weatherCols * 4 + 2, y + 3.5)
  y += 5

  // Weather values
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(String(weather.tempHigh || '-'), margin + weatherCols + 5, y + 3)
  doc.text(String(weather.tempLow || '-'), margin + weatherCols * 1.5 + 5, y + 3)
  doc.text(weather.rowConditions || 'Wet', margin + weatherCols * 2 + 2, y + 3)
  doc.text(weather.conditions || 'Rain', margin + weatherCols * 3 + 2, y + 3)
  doc.text(String(weather.precipitation || '0'), margin + weatherCols * 4 + 2, y + 3)
  y += 8

  // SECTION 2 - PROGRESS
  addSectionHeader('SECTION 2 - PROGRESS')

  // PLANNED VS ACTUAL table
  setColor(COLORS.grayLight, 'fill')
  doc.rect(margin, y, contentWidth, 5, 'F')
  setColor(COLORS.grayMid, 'draw')
  doc.rect(margin, y, contentWidth, 5, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setColor(COLORS.black, 'text')
  doc.text('PLANNED VS ACTUAL', margin + 2, y + 3.5)
  y += 5

  // Table headers
  const pvaColWidths = [35, 18, 15, 15, 14, 18, 18, 18, 18, 18, 18, 10]
  const pvaHeaders = ['Section', 'Start Date', 'KP Start', 'KP End', 'Activity', 'Daily Planned (lm)', 'Daily Actual (lm)', 'Delta (lm)', 'Weekly Planned (lm)', 'Weekly Actuals (lm)', 'Delta (lm)', 'Notes']

  setColor(COLORS.grayLight, 'fill')
  let headerX = margin
  pvaColWidths.forEach((w, i) => {
    doc.rect(headerX, y, w, 5, 'F')
    setColor(COLORS.grayMid, 'draw')
    doc.rect(headerX, y, w, 5, 'S')
    setColor(COLORS.black, 'text')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(4)
    doc.text(pvaHeaders[i], headerX + 1, y + 3.5)
    headerX += w
  })
  y += 5

  // Table rows (Civil and Mechanical sections)
  const plannedVsActual = progressData.plannedVsActual || []
  plannedVsActual.slice(0, 40).forEach((row, idx) => {
    checkPageBreak(5)

    const isTotal = row.isTotal
    const bgColor = isTotal ? COLORS.egpGreenLight : (idx % 2 === 0 ? COLORS.white : COLORS.grayLight)

    setColor(bgColor, 'fill')
    let rowX = margin
    const values = [
      row.section?.substring(0, 22) || '',
      row.startDate?.substring(0, 10) || '',
      formatKP(row.kpStart),
      formatKP(row.kpEnd),
      row.activity || '',
      formatNumber(row.dailyPlanned, 2),
      formatNumber(row.dailyActual, 2) || '-',
      row.dailyDelta ? `(${formatNumber(Math.abs(row.dailyDelta), 2)})` : '-',
      formatNumber(row.weeklyPlanned, 2),
      formatNumber(row.weeklyActual, 2),
      row.weeklyDelta ? (row.weeklyDelta >= 0 ? formatNumber(row.weeklyDelta, 2) : `(${formatNumber(Math.abs(row.weeklyDelta), 2)})`) : '-',
      ''
    ]

    pvaColWidths.forEach((w, i) => {
      doc.rect(rowX, y, w, 4, 'F')
      setColor(COLORS.grayMid, 'draw')
      doc.rect(rowX, y, w, 4, 'S')
      setColor(COLORS.black, 'text')
      doc.setFont(isTotal ? 'helvetica' : 'helvetica', isTotal ? 'bold' : 'normal')
      doc.setFontSize(4)
      doc.text(String(values[i]).substring(0, 15), rowX + 1, y + 2.8)
      rowX += w
    })
    y += 4
  })

  y += 3

  // PROGRESS TO DATE table
  checkPageBreak(40)

  setColor(COLORS.grayLight, 'fill')
  doc.rect(margin, y, contentWidth, 5, 'F')
  setColor(COLORS.grayMid, 'draw')
  doc.rect(margin, y, contentWidth, 5, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setColor(COLORS.black, 'text')
  doc.text('PROGRESS TO DATE', margin + 2, y + 3.5)
  y += 5

  // Progress to Date table headers
  const ptdColWidths = [40, 20, 25, 30, 25, 25, 30]
  const ptdHeaders = ['Description', 'Unit of Measure', 'Total Planned Units', 'Completed To Date', 'Remaining', '% Complete', '% Remaining']

  setColor(COLORS.grayLight, 'fill')
  let ptdHeaderX = margin
  ptdColWidths.forEach((w, i) => {
    doc.rect(ptdHeaderX, y, w, 5, 'F')
    setColor(COLORS.grayMid, 'draw')
    doc.rect(ptdHeaderX, y, w, 5, 'S')
    setColor(COLORS.black, 'text')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5)
    doc.text(ptdHeaders[i], ptdHeaderX + 1, y + 3.5)
    ptdHeaderX += w
  })
  y += 5

  // Progress to Date rows
  const progressToDate = progressData.progressToDate || []
  progressToDate.forEach((row, idx) => {
    checkPageBreak(5)

    const bgColor = idx % 2 === 0 ? COLORS.white : COLORS.grayLight
    setColor(bgColor, 'fill')

    let rowX = margin
    const values = [
      row.description || '',
      row.unit || '',
      row.totalPlanned?.toLocaleString() || '-',
      row.completedToDate?.toLocaleString() || '0',
      row.remaining?.toLocaleString() || '-',
      `${row.percentComplete || 0}%`,
      `${row.percentRemaining || 100}%`
    ]

    ptdColWidths.forEach((w, i) => {
      doc.rect(rowX, y, w, 4, 'F')
      setColor(COLORS.grayMid, 'draw')
      doc.rect(rowX, y, w, 4, 'S')
      setColor(COLORS.black, 'text')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5)
      doc.text(String(values[i]).substring(0, 18), rowX + 1, y + 2.8)
      rowX += w
    })
    y += 4
  })

  y += 3

  // WELDING PROGRESS tables (side by side)
  checkPageBreak(40)

  const weldTableWidth = (contentWidth - 4) / 2

  // Welding Progress (lm) - Left side
  setColor(COLORS.grayLight, 'fill')
  doc.rect(margin, y, weldTableWidth, 5, 'F')
  setColor(COLORS.grayMid, 'draw')
  doc.rect(margin, y, weldTableWidth, 5, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  setColor(COLORS.black, 'text')
  doc.text('Section 2.a Welding Progress (lm)', margin + 2, y + 3.5)

  // Welding Progress (ea.) - Right side
  setColor(COLORS.grayLight, 'fill')
  doc.rect(margin + weldTableWidth + 4, y, weldTableWidth, 5, 'F')
  setColor(COLORS.grayMid, 'draw')
  doc.rect(margin + weldTableWidth + 4, y, weldTableWidth, 5, 'S')

  doc.text('Section 2.b Welding Progress (ea.)', margin + weldTableWidth + 6, y + 3.5)
  y += 5

  // Welding LM table headers
  const weldLmCols = [25, 18, 18, 15, 15, 15]
  const weldLmHeaders = ['WELDING', 'FROM STATION', 'TO STATION', 'TODAY (m)', 'PREVIOUS (m)', 'TOTAL (m)']

  setColor(COLORS.grayLight, 'fill')
  let weldLmX = margin
  weldLmCols.forEach((w, i) => {
    doc.rect(weldLmX, y, w, 4, 'F')
    setColor(COLORS.grayMid, 'draw')
    doc.rect(weldLmX, y, w, 4, 'S')
    setColor(COLORS.black, 'text')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(4)
    doc.text(weldLmHeaders[i], weldLmX + 1, y + 2.8)
    weldLmX += w
  })

  // Welding Count table headers
  const weldCountCols = [35, 15, 15, 15]
  const weldCountHeaders = ['', 'TODAY', 'PREVIOUS', 'TOTAL']

  let weldCountX = margin + weldTableWidth + 4
  weldCountCols.forEach((w, i) => {
    doc.rect(weldCountX, y, w, 4, 'F')
    setColor(COLORS.grayMid, 'draw')
    doc.rect(weldCountX, y, w, 4, 'S')
    if (i > 0) {
      setColor(COLORS.black, 'text')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(4)
      doc.text(weldCountHeaders[i], weldCountX + 1, y + 2.8)
    }
    weldCountX += w
  })
  y += 4

  // Welding data rows
  const weldingByLM = weldingData.byLM || []
  const weldingByCount = weldingData.byCount || []

  const maxWeldRows = Math.max(weldingByLM.length, weldingByCount.length, 7)
  for (let i = 0; i < maxWeldRows; i++) {
    checkPageBreak(5)

    const lmRow = weldingByLM[i] || {}
    const countRow = weldingByCount[i] || {}
    const bgColor = i % 2 === 0 ? COLORS.white : COLORS.grayLight

    // LM table row
    setColor(bgColor, 'fill')
    weldLmX = margin
    const lmValues = [
      lmRow.weldType?.substring(0, 20) || '',
      lmRow.fromStation || '',
      lmRow.toStation || '',
      formatNumber(lmRow.todayLm),
      formatNumber(lmRow.previousLm),
      formatNumber(lmRow.totalLm)
    ]

    weldLmCols.forEach((w, j) => {
      doc.rect(weldLmX, y, w, 4, 'F')
      setColor(COLORS.grayMid, 'draw')
      doc.rect(weldLmX, y, w, 4, 'S')
      setColor(COLORS.black, 'text')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(4)
      doc.text(String(lmValues[j]).substring(0, 15), weldLmX + 1, y + 2.8)
      weldLmX += w
    })

    // Count table row
    setColor(bgColor, 'fill')
    weldCountX = margin + weldTableWidth + 4
    const countValues = [
      countRow.weldType?.substring(0, 25) || '',
      formatNumber(countRow.today),
      formatNumber(countRow.previous),
      formatNumber(countRow.total)
    ]

    weldCountCols.forEach((w, j) => {
      doc.rect(weldCountX, y, w, 4, 'F')
      setColor(COLORS.grayMid, 'draw')
      doc.rect(weldCountX, y, w, 4, 'S')
      setColor(COLORS.black, 'text')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(4)
      doc.text(String(countValues[j]).substring(0, 20), weldCountX + 1, y + 2.8)
      weldCountX += w
    })

    y += 4
  }

  // Weld totals row
  y += 1
  setColor(COLORS.egpGreenLight, 'fill')
  doc.rect(margin + weldTableWidth + 4, y, weldTableWidth, 4, 'F')
  setColor(COLORS.grayMid, 'draw')
  doc.rect(margin + weldTableWidth + 4, y, weldTableWidth, 4, 'S')

  const totalWelds = weldingByCount.reduce((sum, w) => sum + (w.total || 0), 0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(4)
  setColor(COLORS.black, 'text')
  doc.text('TOTAL', margin + weldTableWidth + 6, y + 2.8)
  doc.text(String(totalWelds), margin + weldTableWidth + 4 + 65, y + 2.8)
  y += 6

  // Repairs table
  checkPageBreak(25)

  setColor(COLORS.grayLight, 'fill')
  doc.rect(margin, y, 60, 5, 'F')
  setColor(COLORS.grayMid, 'draw')
  doc.rect(margin, y, 60, 5, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  setColor(COLORS.black, 'text')
  doc.text('Repairs', margin + 2, y + 3.5)
  y += 5

  // Repairs headers
  const repairCols = [25, 12, 12, 12]
  setColor(COLORS.grayLight, 'fill')
  let repairX = margin
  ;['Repairs', 'TODAY', 'PREVIOUS', 'TOTAL'].forEach((h, i) => {
    doc.rect(repairX, y, repairCols[i], 4, 'F')
    setColor(COLORS.grayMid, 'draw')
    doc.rect(repairX, y, repairCols[i], 4, 'S')
    setColor(COLORS.black, 'text')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(4)
    doc.text(h, repairX + 1, y + 2.8)
    repairX += repairCols[i]
  })
  y += 4

  // Repairs rows
  const repairs = weldingData.repairs || []
  repairs.forEach((repair, idx) => {
    const bgColor = idx % 2 === 0 ? COLORS.white : COLORS.grayLight
    setColor(bgColor, 'fill')

    repairX = margin
    const values = [repair.type || '', formatNumber(repair.today), formatNumber(repair.previous), formatNumber(repair.total)]

    repairCols.forEach((w, i) => {
      doc.rect(repairX, y, w, 4, 'F')
      setColor(COLORS.grayMid, 'draw')
      doc.rect(repairX, y, w, 4, 'S')
      setColor(COLORS.black, 'text')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(4)
      doc.text(String(values[i]), repairX + 1, y + 2.8)
      repairX += w
    })
    y += 4
  })

  // Total repairs and rate
  y += 1
  setColor(COLORS.egpGreenLight, 'fill')
  repairX = margin
  doc.rect(repairX, y, 61, 4, 'F')
  setColor(COLORS.grayMid, 'draw')
  doc.rect(repairX, y, 61, 4, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(4)
  setColor(COLORS.black, 'text')
  doc.text('Total Repairs', repairX + 1, y + 2.8)
  doc.text(String(weldingData.totalRepairs || 0), repairX + 49, y + 2.8)
  y += 4

  setColor(COLORS.yellow, 'fill')
  doc.rect(repairX, y, 61, 4, 'F')
  setColor(COLORS.grayMid, 'draw')
  doc.rect(repairX, y, 61, 4, 'S')

  doc.setFont('helvetica', 'bold')
  setColor(COLORS.black, 'text')
  doc.text('Repair Rate', repairX + 1, y + 2.8)
  doc.text(`${weldingData.repairRate || '0.0'}%`, repairX + 49, y + 2.8)

  addFooter()

  // =============================================
  // PAGE 2 - PICTURES
  // =============================================

  doc.addPage()
  currentPage = 2
  addPageHeader()
  addReportTitle()

  // SECTION 2 - PICTURES
  addSectionHeader('SECTION 2 - PICTURES')

  // Photo grid (2 columns x 3 rows)
  const photoWidth = (contentWidth - 4) / 2
  const photoHeight = 55
  const photosToShow = selectedPhotos.slice(0, 6)

  for (let row = 0; row < 3; row++) {
    checkPageBreak(photoHeight + 10)

    for (let col = 0; col < 2; col++) {
      const photoIdx = row * 2 + col
      const photo = photosToShow[photoIdx]
      const photoX = margin + col * (photoWidth + 4)

      // Photo location header
      setColor(COLORS.grayLight, 'fill')
      doc.rect(photoX, y, photoWidth, 5, 'F')
      setColor(COLORS.grayMid, 'draw')
      doc.rect(photoX, y, photoWidth, 5, 'S')

      setColor(COLORS.black, 'text')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6)
      doc.text(photo?.kpLocation || `Location ${photoIdx + 1}`, photoX + 2, y + 3.5)

      // Description
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5)
      doc.text(photo?.description?.substring(0, 40) || 'Description', photoX + photoWidth / 2, y + 3.5)
    }
    y += 5

    // Photo area
    for (let col = 0; col < 2; col++) {
      const photoIdx = row * 2 + col
      const photo = photosToShow[photoIdx]
      const photoX = margin + col * (photoWidth + 4)

      // Photo placeholder/image area
      setColor(COLORS.grayLight, 'fill')
      doc.rect(photoX, y, photoWidth, photoHeight, 'F')
      setColor(COLORS.grayMid, 'draw')
      doc.rect(photoX, y, photoWidth, photoHeight, 'S')

      if (photo?.url) {
        try {
          // Try to add image
          doc.addImage(photo.url, 'JPEG', photoX + 1, y + 1, photoWidth - 2, photoHeight - 10, '', 'FAST')
        } catch (err) {
          // Fallback to placeholder
          setColor(COLORS.gray, 'text')
          doc.setFontSize(10)
          doc.text('Photo', photoX + photoWidth / 2, y + photoHeight / 2, { align: 'center' })
        }
      } else {
        setColor(COLORS.gray, 'text')
        doc.setFontSize(10)
        doc.text('Photo', photoX + photoWidth / 2, y + photoHeight / 2, { align: 'center' })
      }

      // Geo-tag info at bottom of photo
      if (photo) {
        const geoY = y + photoHeight - 8
        setColor(COLORS.egpGreen, 'fill')
        doc.rect(photoX, geoY, photoWidth, 8, 'F')

        setColor(COLORS.white, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(5)

        // Direction
        doc.text('DIRECTION', photoX + 2, geoY + 3)
        doc.text(photo.direction ? `${photo.direction} deg(T)` : '-', photoX + 2, geoY + 6.5)

        // Coordinates
        doc.text(photo.latitude ? `${photo.latitude.toFixed(5)}N` : '-', photoX + 25, geoY + 3)
        doc.text(photo.longitude ? `${Math.abs(photo.longitude).toFixed(5)}W` : '-', photoX + 25, geoY + 6.5)

        // Accuracy
        doc.text('ACCURACY', photoX + 55, geoY + 3)
        doc.text(photo.accuracy ? `${photo.accuracy} m` : '-', photoX + 55, geoY + 6.5)
        doc.text('DATUM WGS84', photoX + 70, geoY + 6.5)

        // Caption
        if (photo.description) {
          setColor(COLORS.yellow, 'fill')
          doc.rect(photoX, geoY + 8, photoWidth, 5, 'F')
          setColor(COLORS.black, 'text')
          doc.setFontSize(5)
          doc.text(photo.description.substring(0, 35), photoX + 2, geoY + 11.5)

          // Timestamp
          if (photo.timestamp) {
            doc.text(new Date(photo.timestamp).toISOString().substring(0, 16).replace('T', ' '), photoX + photoWidth - 25, geoY + 11.5)
          }
        }
      }
    }
    y += photoHeight + 5
  }

  // Signature Block
  checkPageBreak(35)
  y += 5

  setColor(COLORS.black, 'text')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Fortis BC', margin, y)
  y += 8

  // Signature lines
  const sigWidth = (contentWidth - 20) / 2

  // Lead Inspector
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('Lead Inspector: (Signature)', margin, y)
  doc.text('Construction Manager: (Signature)', margin + sigWidth + 20, y)
  y += 15

  // Signature line
  setColor(COLORS.black, 'draw')
  doc.line(margin, y, margin + sigWidth, y)
  doc.line(margin + sigWidth + 20, y, margin + sigWidth * 2 + 20, y)

  // Names (if provided)
  if (leadInspector) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    setColor(COLORS.black, 'text')
    doc.text(leadInspector, margin + sigWidth / 2, y - 2, { align: 'center' })
  }
  if (constructionManager) {
    doc.text(constructionManager, margin + sigWidth * 1.5 + 20, y - 2, { align: 'center' })
  }

  y += 8

  // Date lines
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('Date:', margin, y)
  doc.text('Date:', margin + sigWidth + 20, y)
  y += 5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(reportDate || '', margin + 15, y)
  doc.text(reportDate || '', margin + sigWidth + 35, y)

  addFooter()

  return doc
}

/**
 * Generate and download EGP PDF
 */
export function downloadEGPConstructionPDF(data) {
  const doc = generateEGPConstructionPDF(data)
  const filename = `${data.reportDate || 'report'}_Construction_Summary_Report.pdf`
  doc.save(filename)
  return filename
}

/**
 * Generate SHA-256 hash for document integrity
 */
export async function generateDocumentHash(content) {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export default {
  generateEGPConstructionPDF,
  downloadEGPConstructionPDF,
  generateDocumentHash
}
