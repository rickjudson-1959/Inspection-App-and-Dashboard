import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { useOrg } from './contexts/OrgContext';
import { ACTIVITY_TYPE_MAP } from './DPRConfig';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function DPRTab() {
  const { organizationId } = useOrg();
  const [config, setConfig] = useState(null);
  const [reportDate, setReportDate] = useState(() => {
    // Default to yesterday
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  });
  const [loading, setLoading] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  // DPR data
  const [dprId, setDprId] = useState(null);
  const [status, setStatus] = useState('draft');
  const [progressData, setProgressData] = useState([]);
  const [weldData, setWeldData] = useState({
    mainline: { today: 0, previous: 0, to_date: 0 },
    poor_boy: { today: 0, previous: 0, to_date: 0 },
    section: { today: 0, previous: 0, to_date: 0 },
    tie_in: { today: 0, previous: 0, to_date: 0 },
    final_tie_in: { today: 0, previous: 0, to_date: 0 },
    repair_rate: 0,
  });
  const [supplementaryData, setSupplementaryData] = useState([]);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [weatherSummary, setWeatherSummary] = useState('');
  const [weatherHigh, setWeatherHigh] = useState('');
  const [weatherLow, setWeatherLow] = useState('');
  const [preparedBy, setPreparedBy] = useState('');
  const [reportCount, setReportCount] = useState(0);

  // Load DPR config
  useEffect(() => {
    if (!organizationId) return;
    (async () => {
      setLoadingConfig(true);
      const { data } = await supabase
        .from('dpr_config')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();
      setConfig(data);
      if (data?.prepared_by_default) setPreparedBy(data.prepared_by_default);
      setLoadingConfig(false);
    })();
  }, [organizationId]);

  // Check for existing DPR when date changes
  useEffect(() => {
    if (!organizationId || !reportDate) return;
    (async () => {
      const { data } = await supabase
        .from('daily_progress_reports')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('report_date', reportDate)
        .maybeSingle();
      if (data) {
        setDprId(data.id);
        setStatus(data.status);
        setProgressData(data.progress_data || []);
        setWeldData(data.weld_data || weldData);
        setSupplementaryData(data.supplementary_data || []);
        setComments(data.comments || []);
        setWeatherSummary(data.weather_summary || '');
        setWeatherHigh(data.weather_high || '');
        setWeatherLow(data.weather_low || '');
        setPreparedBy(data.prepared_by || config?.prepared_by_default || '');
      } else {
        setDprId(null);
        setStatus('draft');
        setProgressData([]);
        setSupplementaryData([]);
        setComments([]);
        setWeatherSummary('');
        setWeatherHigh('');
        setWeatherLow('');
        setPreparedBy(config?.prepared_by_default || '');
      }
    })();
  }, [organizationId, reportDate]);

  // ─── LOAD DATA: aggregate approved reports for selected date ───
  const loadData = useCallback(async () => {
    if (!organizationId || !config) return;
    setLoading(true);

    try {
      // 1. Fetch approved reports for the selected date
      const { data: reports, error: repErr } = await supabase
        .from('daily_reports')
        .select('id, report_date, activity_blocks, weather_conditions, weather_temp_high, weather_temp_low')
        .eq('organization_id', organizationId)
        .eq('report_date', reportDate)
        .in('status', ['approved', 'published']);

      if (repErr) throw repErr;
      setReportCount(reports?.length || 0);

      if (!reports?.length) {
        setLoading(false);
        return;
      }

      // 2. Aggregate activity blocks by DPR activity key
      const activityMap = {}; // key → { from_kp, to_kp }
      const weldCounts = { mainline: 0, poor_boy: 0, section: 0, tie_in: 0 };
      const weatherSet = { summary: '', high: '', low: '' };
      const workDescriptions = [];

      for (const report of reports) {
        // Weather — take from first report that has it
        if (!weatherSet.summary && report.weather_conditions) {
          weatherSet.summary = report.weather_conditions;
        }
        if (!weatherSet.high && report.weather_temp_high) {
          weatherSet.high = report.weather_temp_high;
        }
        if (!weatherSet.low && report.weather_temp_low) {
          weatherSet.low = report.weather_temp_low;
        }

        const blocks = report.activity_blocks || [];
        for (const block of blocks) {
          const activityType = block.activityType || block.activity_type || '';
          const dprKey = ACTIVITY_TYPE_MAP[activityType];

          if (dprKey && config.activities?.find(a => a.key === dprKey)) {
            const fromKp = parseFloat(block.fromKP || block.from_kp) || null;
            const toKp = parseFloat(block.toKP || block.to_kp) || null;

            if (fromKp !== null || toKp !== null) {
              if (!activityMap[dprKey]) {
                activityMap[dprKey] = { from_kp: fromKp, to_kp: toKp };
              } else {
                if (fromKp !== null && (activityMap[dprKey].from_kp === null || fromKp < activityMap[dprKey].from_kp)) {
                  activityMap[dprKey].from_kp = fromKp;
                }
                if (toKp !== null && (activityMap[dprKey].to_kp === null || toKp > activityMap[dprKey].to_kp)) {
                  activityMap[dprKey].to_kp = toKp;
                }
              }
            }

            // Weld counts from welding activities
            if (activityType === 'Welding - Mainline') {
              weldCounts.mainline += parseInt(block.weldCount || block.weld_count) || 0;
            } else if (activityType === 'Welding - Poor Boy') {
              weldCounts.poor_boy += parseInt(block.weldCount || block.weld_count) || 0;
            } else if (activityType === 'Welding - Section Crew') {
              weldCounts.section += parseInt(block.weldCount || block.weld_count) || 0;
            } else if (activityType === 'Welding - Tie-in') {
              weldCounts.tie_in += parseInt(block.weldCount || block.weld_count) || 0;
            }
          }

          // Collect work descriptions for comment seeding
          if (block.workDescription || block.work_description) {
            const desc = (block.workDescription || block.work_description).trim();
            if (desc) workDescriptions.push(` - ${desc}`);
          }
        }
      }

      // 3. Get previous cumulative data from daily_progress_log
      const { data: prevLogs } = await supabase
        .from('daily_progress_log')
        .select('activity_key, to_kp')
        .eq('organization_id', organizationId)
        .lt('report_date', reportDate)
        .order('report_date', { ascending: false });

      // Get the most recent to_kp for each activity (that's the "previous" cumulative)
      const prevCumulative = {};
      if (prevLogs) {
        for (const log of prevLogs) {
          if (!prevCumulative[log.activity_key] && log.to_kp !== null) {
            prevCumulative[log.activity_key] = parseFloat(log.to_kp);
          }
        }
      }

      // 4. Get previous weld totals
      const { data: prevDprs } = await supabase
        .from('daily_progress_reports')
        .select('weld_data')
        .eq('organization_id', organizationId)
        .lt('report_date', reportDate)
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      const prevWelds = prevDprs?.weld_data || {};

      // 5. Build progress data rows
      const pipelineLength = parseFloat(config.pipeline_length_metres) || 1;
      const newProgressData = (config.activities || []).map(activity => {
        const todayData = activityMap[activity.key];
        const prevToKp = prevCumulative[activity.key] || 0;
        const todayFromKp = todayData?.from_kp || prevToKp || 0;
        const todayToKp = todayData?.to_kp || prevToKp || 0;
        const todayMetres = todayToKp > prevToKp ? todayToKp - prevToKp : 0;
        const totalToDate = todayToKp;

        return {
          activity_key: activity.key,
          label: activity.label,
          from_kp: todayFromKp,
          to_kp: todayToKp,
          today_metres: todayMetres,
          previous_to_kp: prevToKp,
          total_to_date: totalToDate,
          pct_complete: pipelineLength > 0 ? (totalToDate / pipelineLength) : 0,
        };
      });

      setProgressData(newProgressData);

      // 6. Build weld data
      setWeldData({
        mainline: {
          today: weldCounts.mainline,
          previous: prevWelds?.mainline?.to_date || 0,
          to_date: (prevWelds?.mainline?.to_date || 0) + weldCounts.mainline,
        },
        poor_boy: {
          today: weldCounts.poor_boy,
          previous: prevWelds?.poor_boy?.to_date || 0,
          to_date: (prevWelds?.poor_boy?.to_date || 0) + weldCounts.poor_boy,
        },
        section: {
          today: weldCounts.section,
          previous: prevWelds?.section?.to_date || 0,
          to_date: (prevWelds?.section?.to_date || 0) + weldCounts.section,
        },
        tie_in: {
          today: weldCounts.tie_in,
          previous: prevWelds?.tie_in?.to_date || 0,
          to_date: (prevWelds?.tie_in?.to_date || 0) + weldCounts.tie_in,
        },
        final_tie_in: { today: 0, previous: 0, to_date: 0 },
        repair_rate: 0,
      });

      // 7. Seed comments from work descriptions (only if no existing comments)
      if (comments.length === 0 && workDescriptions.length > 0) {
        setComments(workDescriptions);
      }

      // 8. Weather
      setWeatherSummary(weatherSet.summary || weatherSummary);
      setWeatherHigh(weatherSet.high || weatherHigh);
      setWeatherLow(weatherSet.low || weatherLow);

      // 9. Supplementary sections (carry forward from config, admin fills in manually)
      if (supplementaryData.length === 0 && config.supplementary_sections?.length) {
        setSupplementaryData(config.supplementary_sections.map(s => ({
          key: s.key,
          label: s.label,
          today: 0,
          previous: 0,
          to_date: 0,
          total: s.total_count || 0,
          pct_complete: 0,
        })));
      }

    } catch (err) {
      console.error('DPR load error:', err);
      alert('Error loading report data: ' + err.message);
    }

    setLoading(false);
  }, [organizationId, config, reportDate]);

  // ─── SAVE DRAFT ───
  const saveDraft = async () => {
    if (!organizationId) return;
    setSaving(true);

    const payload = {
      organization_id: organizationId,
      report_date: reportDate,
      status: 'draft',
      progress_data: progressData,
      weld_data: weldData,
      supplementary_data: supplementaryData,
      comments,
      weather_summary: weatherSummary,
      weather_high: weatherHigh,
      weather_low: weatherLow,
      prepared_by: preparedBy,
      created_by: (await supabase.auth.getUser()).data?.user?.id,
    };

    let error;
    if (dprId) {
      ({ error } = await supabase.from('daily_progress_reports').update(payload).eq('id', dprId));
    } else {
      const { data, error: insertErr } = await supabase.from('daily_progress_reports').insert(payload).select('id').single();
      error = insertErr;
      if (data) setDprId(data.id);
    }

    // Upsert progress log rows (Sheet 2)
    if (!error) {
      for (const row of progressData) {
        await supabase.from('daily_progress_log').upsert({
          organization_id: organizationId,
          report_date: reportDate,
          activity_key: row.activity_key,
          from_kp: row.from_kp,
          to_kp: row.to_kp,
          metres_today: row.today_metres,
          source: 'auto',
        }, { onConflict: 'organization_id,report_date,activity_key' });
      }
    }

    if (error) {
      alert('Error saving: ' + error.message);
    } else {
      setStatus('draft');
    }
    setSaving(false);
  };

  // ─── GENERATE PDF ───
  const generatePDF = () => {
    const doc = new jsPDF('portrait', 'mm', 'letter');
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 20;

    // Title
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('Daily Production Report', margin, y);
    y += 7;
    doc.setFontSize(12);
    doc.text(config?.project_name || '', margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Contractor: ${config?.contractor_name || ''}`, margin, y);
    doc.text(`Date: ${formatDate(reportDate)}`, pageWidth - margin - 50, y);
    y += 10;

    // Progress Table
    const pipelineLength = parseFloat(config?.pipeline_length_metres) || 0;
    const progressRows = progressData.map(row => [
      row.label,
      formatKP(row.from_kp),
      formatKP(row.to_kp),
      Math.round(row.today_metres).toLocaleString(),
      formatKP(row.previous_to_kp),
      formatKP(row.to_kp),
      pipelineLength ? pipelineLength.toLocaleString() : '',
      row.pct_complete ? (row.pct_complete * 100).toFixed(1) + '%' : '0.0%',
    ]);

    doc.autoTable({
      startY: y,
      head: [['Description', 'From (KP)', 'To (KP)', 'Today', 'Previous', 'Total To Date', 'Length (m)', '% Complete']],
      body: progressRows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [66, 66, 66], fontSize: 8, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 35 },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
      },
      margin: { left: margin, right: margin },
    });

    y = doc.lastAutoTable.finalY + 8;

    // Weld Production
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Weld Production', margin, y);
    y += 2;

    const weldRows = [
      ['Mainline Welds', weldData.mainline.today, weldData.mainline.previous, weldData.mainline.to_date],
      ['Poor Boy Welds', weldData.poor_boy.today, weldData.poor_boy.previous, weldData.poor_boy.to_date],
      ['Section Welds', weldData.section.today, weldData.section.previous, weldData.section.to_date],
      ['Tie-in Welds', weldData.tie_in.today, weldData.tie_in.previous, weldData.tie_in.to_date],
      ['Final Tie-Ins', '', weldData.final_tie_in.previous, weldData.final_tie_in.to_date],
      ['Repair Rate (Mainline)', weldData.repair_rate || 0, '', ''],
    ];

    doc.autoTable({
      startY: y,
      head: [['', 'Today', 'Previous', 'To Date']],
      body: weldRows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [66, 66, 66], fontSize: 8, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      margin: { left: margin, right: margin },
      tableWidth: 120,
    });

    y = doc.lastAutoTable.finalY + 8;

    // Supplementary Sections
    if (supplementaryData.length > 0) {
      for (const section of supplementaryData) {
        doc.setFont(undefined, 'bold');
        doc.text(section.label, margin, y);
        y += 2;
        doc.autoTable({
          startY: y,
          head: [['', 'Today', 'Previous', 'To Date', 'To Install', '% Complete']],
          body: [[
            section.label,
            section.today || 0,
            section.previous || 0,
            section.to_date || 0,
            section.total || 0,
            section.total > 0 ? ((section.to_date / section.total) * 100).toFixed(1) + '%' : '0.0%',
          ]],
          theme: 'grid',
          styles: { fontSize: 8, cellPadding: 1.5 },
          headStyles: { fillColor: [66, 66, 66], fontSize: 8, fontStyle: 'bold' },
          margin: { left: margin, right: margin },
          tableWidth: 140,
        });
        y = doc.lastAutoTable.finalY + 6;
      }
    }

    // Comments
    if (comments.length > 0) {
      doc.setFont(undefined, 'bold');
      doc.setFontSize(10);
      doc.text('Comments:', margin, y);
      y += 5;
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      for (const comment of comments) {
        const lines = doc.splitTextToSize(comment, pageWidth - margin * 2);
        if (y + lines.length * 4 > doc.internal.pageSize.getHeight() - 30) {
          doc.addPage();
          y = 20;
        }
        doc.text(lines, margin, y);
        y += lines.length * 4 + 1;
      }
    }

    y += 6;

    // Weather
    if (weatherSummary || weatherHigh || weatherLow) {
      if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20; }
      doc.setFont(undefined, 'bold');
      doc.setFontSize(10);
      doc.text('Weather:', margin, y);
      y += 5;
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      let weatherLine = weatherSummary || '';
      if (weatherHigh) weatherLine += `   (High) ${weatherHigh}`;
      if (weatherLow) weatherLine += `   ${weatherLow} (Low)`;
      doc.text(weatherLine, margin, y);
      y += 8;
    }

    // Prepared by
    doc.setFontSize(9);
    doc.text(`Prepared by:  ${preparedBy}`, margin, y);

    // Footer
    const footerY = doc.internal.pageSize.getHeight() - 10;
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Generated by Pipe-Up  •  ${new Date().toLocaleString()}`, margin, footerY);
    doc.setTextColor(0);

    return doc;
  };

  // ─── PUBLISH (save + generate PDF) ───
  const handlePublish = async () => {
    await saveDraft();
    const doc = generatePDF();
    doc.save(`DPR_${reportDate}.pdf`);

    if (dprId) {
      await supabase.from('daily_progress_reports')
        .update({ status: 'published' })
        .eq('id', dprId);
      setStatus('published');
    }
  };

  // ─── SEND via Resend ───
  const handleSend = async () => {
    if (!config?.distribution_emails?.length) {
      alert('No distribution emails configured. Add recipients in the DPR Setup tab.');
      return;
    }
    if (!confirm(`Send DPR to ${config.distribution_emails.length} recipients?\n\n${config.distribution_emails.join('\n')}`)) return;

    setSending(true);
    await saveDraft();

    const doc = generatePDF();
    const pdfBase64 = doc.output('datauristring').split(',')[1];

    try {
      const response = await fetch('/api/send-dpr-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: config.distribution_emails,
          subject: `Daily Progress Report - ${config.project_name || 'Pipeline Project'} - ${formatDate(reportDate)}`,
          projectName: config.project_name,
          reportDate: formatDate(reportDate),
          pdfBase64,
          pdfFilename: `DPR_${reportDate}.pdf`,
        }),
      });

      if (!response.ok) throw new Error('Email send failed');

      await supabase.from('daily_progress_reports')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_to: config.distribution_emails,
        })
        .eq('id', dprId);

      setStatus('sent');
      alert(`DPR sent to ${config.distribution_emails.length} recipients.`);
    } catch (err) {
      console.error('Send error:', err);
      alert('Error sending email. The PDF has been saved. You can send manually.');
    }
    setSending(false);
  };

  // ─── INLINE EDIT HELPERS ───
  const updateProgressRow = (index, field, value) => {
    const updated = [...progressData];
    updated[index] = { ...updated[index], [field]: parseFloat(value) || 0 };
    // Recalculate metres and pct
    const row = updated[index];
    row.today_metres = Math.max(0, (row.to_kp || 0) - (row.previous_to_kp || 0));
    row.total_to_date = row.to_kp || 0;
    const pipeLen = parseFloat(config?.pipeline_length_metres) || 1;
    row.pct_complete = pipeLen > 0 ? row.total_to_date / pipeLen : 0;
    setProgressData(updated);
  };

  const updateWeld = (type, field, value) => {
    const updated = { ...weldData };
    updated[type] = { ...updated[type], [field]: parseInt(value) || 0 };
    updated[type].to_date = updated[type].previous + updated[type].today;
    setWeldData(updated);
  };

  const updateComment = (index, value) => {
    const updated = [...comments];
    updated[index] = value;
    setComments(updated);
  };

  const removeComment = (index) => {
    setComments(comments.filter((_, i) => i !== index));
  };

  const addComment = () => {
    if (!newComment.trim()) return;
    setComments([...comments, ` - ${newComment.trim()}`]);
    setNewComment('');
  };

  // ─── RENDER ───
  if (loadingConfig) return <div style={{ padding: 20, color: '#888' }}>Loading...</div>;

  if (!config) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>
        <p style={{ fontSize: 16, marginBottom: 8 }}>DPR not configured yet.</p>
        <p style={{ fontSize: 14 }}>Go to the Setup tab and configure the Daily Progress Report section first.</p>
      </div>
    );
  }

  const statusColors = { draft: '#ff9800', published: '#2196f3', sent: '#4caf50' };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Daily Progress Report</h2>
        {status !== 'draft' && (
          <span style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            backgroundColor: statusColors[status] + '20', color: statusColors[status],
            textTransform: 'uppercase',
          }}>{status}</span>
        )}
      </div>

      {/* Date + Load */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
        padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8,
      }}>
        <label style={{ fontSize: 14, fontWeight: 600 }}>Report Date:</label>
        <input
          type="date"
          value={reportDate}
          onChange={e => setReportDate(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
        />
        <button
          onClick={loadData}
          disabled={loading}
          style={{
            padding: '8px 20px', fontSize: 14, fontWeight: 600,
            backgroundColor: loading ? '#ccc' : '#1976d2', color: '#fff',
            border: 'none', borderRadius: 6, cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Loading...' : 'Load Data'}
        </button>
        {reportCount > 0 && (
          <span style={{ fontSize: 13, color: '#666' }}>
            {reportCount} approved report{reportCount !== 1 ? 's' : ''} found
          </span>
        )}
      </div>

      {/* Project Header */}
      <div style={{ marginBottom: 16, padding: '8px 12px', backgroundColor: '#e8eaf6', borderRadius: 6 }}>
        <strong>{config.project_name}</strong> — Contractor: {config.contractor_name} — {formatDate(reportDate)}
      </div>

      {/* Progress Table */}
      <div style={{ marginBottom: 20, overflowX: 'auto' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Construction Progress</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: '#424242', color: '#fff' }}>
              <th style={thStyle}>Description</th>
              <th style={{ ...thStyle, width: 80 }}>From (KP)</th>
              <th style={{ ...thStyle, width: 80 }}>To (KP)</th>
              <th style={{ ...thStyle, width: 70 }}>Today</th>
              <th style={{ ...thStyle, width: 80 }}>Previous</th>
              <th style={{ ...thStyle, width: 80 }}>Total to Date</th>
              <th style={{ ...thStyle, width: 80 }}>Length (m)</th>
              <th style={{ ...thStyle, width: 70 }}>% Complete</th>
            </tr>
          </thead>
          <tbody>
            {progressData.map((row, i) => (
              <tr key={row.activity_key} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                <td style={tdStyle}>{row.label}</td>
                <td style={tdStyleNum}>
                  <input type="number" value={row.from_kp || ''} onChange={e => updateProgressRow(i, 'from_kp', e.target.value)} style={cellInput} />
                </td>
                <td style={tdStyleNum}>
                  <input type="number" value={row.to_kp || ''} onChange={e => updateProgressRow(i, 'to_kp', e.target.value)} style={cellInput} />
                </td>
                <td style={{ ...tdStyleNum, fontWeight: 600 }}>{Math.round(row.today_metres).toLocaleString()}</td>
                <td style={tdStyleNum}>{formatKP(row.previous_to_kp)}</td>
                <td style={tdStyleNum}>{formatKP(row.to_kp)}</td>
                <td style={tdStyleNum}>{config.pipeline_length_metres ? parseFloat(config.pipeline_length_metres).toLocaleString() : ''}</td>
                <td style={{ ...tdStyleNum, fontWeight: 600, color: row.pct_complete >= 1 ? '#2e7d32' : '#333' }}>
                  {(row.pct_complete * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Weld Production */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Weld Production</h3>
        <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: '#424242', color: '#fff' }}>
              <th style={{ ...thStyle, width: 160 }}></th>
              <th style={{ ...thStyle, width: 80 }}>Today</th>
              <th style={{ ...thStyle, width: 80 }}>Previous</th>
              <th style={{ ...thStyle, width: 80 }}>To Date</th>
            </tr>
          </thead>
          <tbody>
            {['mainline', 'poor_boy', 'section', 'tie_in', 'final_tie_in'].map((type, i) => (
              <tr key={type} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                <td style={tdStyle}>{WELD_LABELS[type]}</td>
                <td style={tdStyleNum}>
                  <input type="number" value={weldData[type]?.today || ''} onChange={e => updateWeld(type, 'today', e.target.value)} style={cellInput} />
                </td>
                <td style={tdStyleNum}>{weldData[type]?.previous || 0}</td>
                <td style={{ ...tdStyleNum, fontWeight: 600 }}>{weldData[type]?.to_date || 0}</td>
              </tr>
            ))}
            <tr style={{ backgroundColor: '#fff3e0' }}>
              <td style={tdStyle}>Repair Rate (Mainline)</td>
              <td style={tdStyleNum}>
                <input type="number" step="0.1" value={weldData.repair_rate || ''} onChange={e => setWeldData({ ...weldData, repair_rate: parseFloat(e.target.value) || 0 })} style={cellInput} />
              </td>
              <td style={tdStyleNum}></td>
              <td style={tdStyleNum}></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Supplementary Sections */}
      {supplementaryData.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Supplementary</h3>
          {supplementaryData.map((section, i) => (
            <div key={section.key} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
              <strong style={{ width: 140 }}>{section.label}:</strong>
              <label>Today: <input type="number" value={section.today || ''} onChange={e => {
                const u = [...supplementaryData]; u[i] = { ...u[i], today: parseInt(e.target.value) || 0 }; u[i].to_date = u[i].previous + u[i].today;
                u[i].pct_complete = u[i].total > 0 ? u[i].to_date / u[i].total : 0; setSupplementaryData(u);
              }} style={{ ...cellInput, width: 50 }} /></label>
              <span>Previous: {section.previous}</span>
              <span>To Date: <strong>{section.to_date}</strong></span>
              <span>Total: {section.total}</span>
              <span style={{ fontWeight: 600 }}>{section.total > 0 ? ((section.to_date / section.total) * 100).toFixed(1) : '0.0'}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Comments */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Comments</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {comments.map((comment, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea
                value={comment}
                onChange={e => updateComment(i, e.target.value)}
                rows={2}
                style={{
                  flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4,
                  fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
                }}
              />
              <button onClick={() => removeComment(i)} style={{
                padding: '4px 8px', border: '1px solid #c00', borderRadius: 4,
                color: '#c00', backgroundColor: '#fff', cursor: 'pointer', fontSize: 12,
              }}>✕</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addComment()}
            placeholder="Add a comment..."
            style={{ flex: 1, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 }}
          />
          <button onClick={addComment} style={{
            padding: '6px 14px', backgroundColor: '#e8f5e9', border: '1px solid #4caf50',
            borderRadius: 4, color: '#2e7d32', cursor: 'pointer', fontSize: 13,
          }}>+ Add</button>
        </div>
      </div>

      {/* Weather */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Weather</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            value={weatherSummary}
            onChange={e => setWeatherSummary(e.target.value)}
            placeholder="e.g. Mixture of sun and cloud"
            style={{ flex: 1, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 }}
          />
          <label style={{ fontSize: 13 }}>High:
            <input value={weatherHigh} onChange={e => setWeatherHigh(e.target.value)} placeholder="-7c" style={{ width: 60, marginLeft: 4, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 }} />
          </label>
          <label style={{ fontSize: 13 }}>Low:
            <input value={weatherLow} onChange={e => setWeatherLow(e.target.value)} placeholder="-18c" style={{ width: 60, marginLeft: 4, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 }} />
          </label>
        </div>
      </div>

      {/* Prepared By */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ fontSize: 14, fontWeight: 600 }}>Prepared by:</label>
        <input
          value={preparedBy}
          onChange={e => setPreparedBy(e.target.value)}
          style={{ width: 200, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
        />
      </div>

      {/* Action Buttons */}
      <div style={{
        display: 'flex', gap: 12, padding: 16, backgroundColor: '#f5f5f5', borderRadius: 8,
        position: 'sticky', bottom: 0, borderTop: '1px solid #ddd',
      }}>
        <button onClick={saveDraft} disabled={saving} style={{
          padding: '10px 24px', fontSize: 14, fontWeight: 600,
          backgroundColor: '#fff', border: '1px solid #1976d2', color: '#1976d2',
          borderRadius: 6, cursor: 'pointer',
        }}>
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        <button onClick={handlePublish} style={{
          padding: '10px 24px', fontSize: 14, fontWeight: 600,
          backgroundColor: '#1976d2', border: 'none', color: '#fff',
          borderRadius: 6, cursor: 'pointer',
        }}>
          Publish + Download PDF
        </button>
        <button onClick={handleSend} disabled={sending} style={{
          padding: '10px 24px', fontSize: 14, fontWeight: 600,
          backgroundColor: '#4caf50', border: 'none', color: '#fff',
          borderRadius: 6, cursor: 'pointer',
        }}>
          {sending ? 'Sending...' : `Send to ${config.distribution_emails?.length || 0} Recipients`}
        </button>
      </div>
    </div>
  );
}

// ─── CONSTANTS & STYLES ───

const WELD_LABELS = {
  mainline: 'Mainline Welds',
  poor_boy: 'Poor Boy Welds',
  section: 'Section Welds',
  tie_in: 'Tie-in Welds',
  final_tie_in: 'Final Tie-Ins',
};

const thStyle = {
  padding: '6px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600,
};

const tdStyle = {
  padding: '5px 8px', borderBottom: '1px solid #e0e0e0',
};

const tdStyleNum = {
  padding: '5px 8px', borderBottom: '1px solid #e0e0e0', textAlign: 'right',
};

const cellInput = {
  width: 70, padding: '3px 6px', border: '1px solid #ddd', borderRadius: 3,
  fontSize: 13, textAlign: 'right', backgroundColor: '#fff',
};

function formatKP(value) {
  if (!value && value !== 0) return '';
  const num = parseFloat(value);
  if (isNaN(num)) return '';
  return Math.round(num).toLocaleString();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}
