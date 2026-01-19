import jsPDF from 'jspdf'

export async function generateInvoicePDF(timesheet, inspectorProfile, rateCard, lineItems, signatures) {
  const pdf = new jsPDF('p', 'mm', 'letter')
  const pageWidth = 215.9
  const pageHeight = 279.4
  const margin = 20
  const contentWidth = pageWidth - (margin * 2)
  
  // Colors
  const darkBlue = [0, 51, 102]
  const gray = [107, 114, 128]
  const lightGray = [243, 244, 246]
  const green = [5, 150, 105]
  
  let y = margin
  
  // ============================================
  // HEADER
  // ============================================
  pdf.setFillColor(...darkBlue)
  pdf.rect(0, 0, pageWidth, 35, 'F')
  
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(24)
  pdf.setFont('helvetica', 'bold')
  pdf.text('INVOICE', margin, 18)
  
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Invoice #: INV-${timesheet.id?.slice(0, 8).toUpperCase() || 'DRAFT'}`, margin, 28)
  pdf.text(`Date: ${new Date().toLocaleDateString('en-CA')}`, pageWidth - margin - 40, 28)
  
  y = 45
  
  // ============================================
  // BILL TO / FROM
  // ============================================
  pdf.setTextColor(...darkBlue)
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.text('FROM:', margin, y)
  pdf.text('BILL TO:', margin + 90, y)
  
  y += 6
  pdf.setTextColor(0, 0, 0)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  
  // From (Inspector)
  pdf.text(inspectorProfile?.company_name || 'Inspector Name', margin, y)
  y += 5
  if (inspectorProfile?.company_address) {
    pdf.text(inspectorProfile.company_address, margin, y)
    y += 5
  }
  const cityProvince = [inspectorProfile?.company_city, inspectorProfile?.company_province].filter(Boolean).join(', ')
  if (cityProvince) {
    pdf.text(`${cityProvince} ${inspectorProfile?.company_postal_code || ''}`, margin, y)
    y += 5
  }
  if (inspectorProfile?.company_phone) {
    pdf.text(inspectorProfile.company_phone, margin, y)
    y += 5
  }
  if (inspectorProfile?.company_email) {
    pdf.text(inspectorProfile.company_email, margin, y)
  }
  
  // Bill To (Client)
  let billY = 51
  pdf.text(timesheet.client_name || 'Client Name', margin + 90, billY)
  billY += 5
  pdf.text(timesheet.project_name || 'Project Name', margin + 90, billY)
  billY += 5
  if (timesheet.spread_name) {
    pdf.text(`Spread: ${timesheet.spread_name}`, margin + 90, billY)
  }
  
  y = Math.max(y, billY) + 15
  
  // ============================================
  // PERIOD INFO
  // ============================================
  pdf.setFillColor(...lightGray)
  pdf.rect(margin, y, contentWidth, 12, 'F')
  
  pdf.setTextColor(...darkBlue)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.text(`Period: ${timesheet.period_start} to ${timesheet.period_end}`, margin + 5, y + 8)
  pdf.text(`Type: ${timesheet.period_type || 'Biweekly'}`, margin + 100, y + 8)
  
  y += 20
  
  // ============================================
  // LINE ITEMS TABLE
  // ============================================
  pdf.setTextColor(...darkBlue)
  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Timesheet Details', margin, y)
  
  y += 8
  
  // Table header
  pdf.setFillColor(...darkBlue)
  pdf.rect(margin, y, contentWidth, 8, 'F')
  
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Date', margin + 2, y + 5.5)
  pdf.text('Description', margin + 28, y + 5.5)
  pdf.text('Field', margin + 90, y + 5.5)
  pdf.text('P.Diem', margin + 105, y + 5.5)
  pdf.text('Truck', margin + 122, y + 5.5)
  pdf.text('KMs', margin + 138, y + 5.5)
  pdf.text('Elec', margin + 155, y + 5.5)
  
  y += 8
  
  // Table rows
  pdf.setTextColor(0, 0, 0)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  
  const sortedLines = (lineItems || []).sort((a, b) => a.work_date?.localeCompare(b.work_date))
  
  sortedLines.forEach((line, index) => {
    if (y > pageHeight - 60) {
      pdf.addPage()
      y = margin
    }
    
    // Alternating row colors
    if (index % 2 === 0) {
      pdf.setFillColor(250, 250, 250)
      pdf.rect(margin, y, contentWidth, 6, 'F')
    }
    
    // Highlight MOB/DEMOB
    if (line.is_mobilization) {
      pdf.setFillColor(219, 234, 254)
      pdf.rect(margin, y, contentWidth, 6, 'F')
    } else if (line.is_demobilization) {
      pdf.setFillColor(254, 243, 199)
      pdf.rect(margin, y, contentWidth, 6, 'F')
    }
    
    const dateStr = line.work_date ? new Date(line.work_date + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : ''
    let desc = line.work_description || '-'
    if (line.is_mobilization) desc = '📦 MOB - ' + desc
    if (line.is_demobilization) desc = '📦 DEMOB - ' + desc
    if (desc.length > 35) desc = desc.slice(0, 32) + '...'
    
    pdf.text(dateStr, margin + 2, y + 4)
    pdf.text(desc, margin + 28, y + 4)
    pdf.text(line.is_field_day ? '✓' : '', margin + 93, y + 4)
    pdf.text(line.is_per_diem ? '✓' : '', margin + 110, y + 4)
    pdf.text(line.is_truck_day ? '✓' : '', margin + 127, y + 4)
    pdf.text(line.total_kms?.toString() || '0', margin + 138, y + 4)
    pdf.text(line.is_electronics ? '✓' : '', margin + 158, y + 4)
    
    y += 6
  })
  
  // Totals row
  pdf.setFillColor(...lightGray)
  pdf.rect(margin, y, contentWidth, 7, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text('TOTALS', margin + 2, y + 5)
  pdf.text(timesheet.total_field_days?.toString() || '0', margin + 93, y + 5)
  pdf.text(timesheet.total_per_diem_days?.toString() || '0', margin + 110, y + 5)
  pdf.text(timesheet.total_truck_days?.toString() || '0', margin + 127, y + 5)
  pdf.text(timesheet.total_kms?.toString() || '0', margin + 138, y + 5)
  pdf.text(timesheet.total_electronics_days?.toString() || '0', margin + 158, y + 5)
  
  y += 15
  
  // ============================================
  // INVOICE SUMMARY
  // ============================================
  if (y > pageHeight - 80) {
    pdf.addPage()
    y = margin
  }
  
  pdf.setTextColor(...darkBlue)
  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Invoice Summary', margin, y)
  
  y += 8
  
  // Calculate totals
  const rates = rateCard || {
    daily_field_rate: 900,
    per_diem_rate: 180,
    meal_allowance: 70,
    truck_rate: 160,
    km_rate: 1.10,
    electronics_rate: 15
  }
  
  const fieldTotal = (timesheet.total_field_days || 0) * (rates.daily_field_rate || 0)
  const perDiemTotal = (timesheet.total_per_diem_days || 0) * (rates.per_diem_rate || 0)
  const truckTotal = (timesheet.total_truck_days || 0) * (rates.truck_rate || 0)
  const kmTotal = (timesheet.total_excess_kms || 0) * (rates.km_rate || 0)
  const electronicsTotal = (timesheet.total_electronics_days || 0) * (rates.electronics_rate || 0)
  const subtotal = fieldTotal + perDiemTotal + truckTotal + kmTotal + electronicsTotal
  const gst = subtotal * 0.05
  const total = subtotal + gst
  
  // Summary table
  const summaryX = margin + 80
  const summaryWidth = 95
  
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(0, 0, 0)
  
  const summaryLines = [
    [`Daily Field Rate (${timesheet.total_field_days || 0} days × $${rates.daily_field_rate})`, `$${fieldTotal.toFixed(2)}`],
    [`Per Diem (${timesheet.total_per_diem_days || 0} days × $${rates.per_diem_rate})`, `$${perDiemTotal.toFixed(2)}`],
    [`4x4 Truck (${timesheet.total_truck_days || 0} days × $${rates.truck_rate})`, `$${truckTotal.toFixed(2)}`],
    [`Excess KMs (${timesheet.total_excess_kms || 0} km × $${rates.km_rate})`, `$${kmTotal.toFixed(2)}`],
    [`Electronics (${timesheet.total_electronics_days || 0} days × $${rates.electronics_rate})`, `$${electronicsTotal.toFixed(2)}`],
  ]
  
  summaryLines.forEach(([label, amount]) => {
    pdf.text(label, summaryX, y)
    pdf.text(amount, summaryX + summaryWidth - 5, y, { align: 'right' })
    y += 6
  })
  
  // Subtotal line
  y += 2
  pdf.setDrawColor(...gray)
  pdf.line(summaryX, y, summaryX + summaryWidth, y)
  y += 6
  
  pdf.setFont('helvetica', 'bold')
  pdf.text('Subtotal', summaryX, y)
  pdf.text(`$${subtotal.toFixed(2)}`, summaryX + summaryWidth - 5, y, { align: 'right' })
  y += 6
  
  pdf.setFont('helvetica', 'normal')
  pdf.text('GST (5%)', summaryX, y)
  pdf.text(`$${gst.toFixed(2)}`, summaryX + summaryWidth - 5, y, { align: 'right' })
  y += 8
  
  // Total
  pdf.setFillColor(...green)
  pdf.rect(summaryX - 5, y - 1, summaryWidth + 10, 10, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.text('TOTAL', summaryX, y + 6)
  pdf.text(`$${total.toFixed(2)}`, summaryX + summaryWidth - 5, y + 6, { align: 'right' })
  
  y += 20
  
  // ============================================
  // SIGNATURES
  // ============================================
  if (signatures && signatures.length > 0) {
    if (y > pageHeight - 50) {
      pdf.addPage()
      y = margin
    }
    
    pdf.setTextColor(...darkBlue)
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Approvals', margin, y)
    
    y += 10
    
    signatures.forEach((sig, index) => {
      const sigX = margin + (index * 85)
      
      pdf.setFillColor(...lightGray)
      pdf.rect(sigX, y, 80, 25, 'F')
      
      pdf.setTextColor(...darkBlue)
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'bold')
      const sigType = sig.signature_type === 'chief_approval' ? '✅ Chief Approval' : '👀 Admin Review'
      pdf.text(sigType, sigX + 3, y + 5)
      
      pdf.setTextColor(0, 0, 0)
      pdf.setFont('helvetica', 'normal')
      pdf.text(sig.signer_name || 'Unknown', sigX + 3, y + 12)
      pdf.setFontSize(7)
      pdf.text(sig.signer_title || '', sigX + 3, y + 17)
      pdf.text(new Date(sig.signed_at).toLocaleString(), sigX + 3, y + 22)
    })
    
    y += 35
  }
  
  // ============================================
  // PAYMENT INFO
  // ============================================
  if (y > pageHeight - 40) {
    pdf.addPage()
    y = margin
  }
  
  if (inspectorProfile?.bank_name) {
    pdf.setTextColor(...darkBlue)
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Payment Information', margin, y)
    
    y += 6
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text(`Bank: ${inspectorProfile.bank_name}`, margin, y)
    y += 5
    pdf.text(`Institution: ${inspectorProfile.bank_institution || '-'}  Transit: ${inspectorProfile.bank_transit || '-'}  Account: ${inspectorProfile.bank_account || '-'}`, margin, y)
  }
  
  // ============================================
  // FOOTER
  // ============================================
  pdf.setFontSize(8)
  pdf.setTextColor(...gray)
  pdf.text('Generated by Pipe-Up Pipeline Inspector SaaS', pageWidth / 2, pageHeight - 10, { align: 'center' })
  pdf.text(`Invoice ID: ${timesheet.id || 'DRAFT'}`, pageWidth / 2, pageHeight - 5, { align: 'center' })
  
  return pdf
}

export function downloadInvoicePDF(pdf, timesheet, inspectorProfile) {
  const filename = `Invoice_${inspectorProfile?.company_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Inspector'}_${timesheet.period_start}_to_${timesheet.period_end}.pdf`
  pdf.save(filename)
}
