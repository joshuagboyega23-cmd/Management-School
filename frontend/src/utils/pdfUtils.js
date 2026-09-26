import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const SCHOOL_NAME = 'Pinnacle Heights Academy';
const SCHOOL_TAGLINE = 'Excellence in Education — Lagos, Nigeria';

/**
 * Adds a standard school header to the PDF and returns the Y position after it.
 */
function addHeader(doc, title, subtitle = '') {
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(SCHOOL_NAME, 14, 11);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(SCHOOL_TAGLINE, 14, 18);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 210 - 14, 18, { align: 'right' });

  // Title section
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 40);

  if (subtitle) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(subtitle, 14, 48);
    return 55;
  }
  return 48;
}

/**
 * Download a report card PDF for a student.
 * @param {object} student - { full_name, admission_number, class_name, date_of_birth }
 * @param {Array}  rows    - array of report card rows from the API
 */
export function downloadReportCardPDF(student, rows) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const subtitle = `${student?.full_name || 'Student'}  •  Adm No: ${student?.admission_number || '—'}  •  Class: ${student?.class_name || '—'}`;
  const startY = addHeader(doc, 'Academic Report Card', subtitle);

  const tableRows = rows.map((r) => [
    r.subject,
    r.term,
    r.ca_score,
    r.exam_score,
    r.total_score,
    r.grade,
    r.remark || '',
  ]);

  autoTable(doc, {
    startY,
    head: [['Subject', 'Term', 'CA (40)', 'Exam (60)', 'Total (100)', 'Grade', 'Remark']],
    body: tableRows,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { fontStyle: 'bold' },
      4: { fontStyle: 'bold', textColor: [37, 99, 235] },
      5: { fontStyle: 'bold' },
    },
  });

  const safeName = (student?.full_name || 'student').replace(/\s+/g, '_');
  doc.save(`Report_Card_${safeName}.pdf`);
}

/**
 * Download a teacher grade sheet PDF.
 * @param {object} student  - { name, admission_number, class_name } (from teacher's student list)
 * @param {Array}  rows     - reportData array (subject, ca_score, exam_score, total_score, grade)
 */
export function downloadGradeSheetPDF(student, rows) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const subtitle = `${student?.name || student?.full_name || 'Student'}  •  Adm No: ${student?.admission_no || student?.admission_number || '—'}  •  Class: ${student?.class_name || '—'}`;
  const startY = addHeader(doc, 'Student Grade Sheet', subtitle);

  const tableRows = rows.map((r) => [
    r.subject,
    r.term || '',
    r.ca_score,
    r.exam_score,
    r.total_score,
    r.grade,
  ]);

  autoTable(doc, {
    startY,
    head: [['Subject', 'Term', 'CA (40)', 'Exam (60)', 'Total (100)', 'Grade']],
    body: tableRows,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { fontStyle: 'bold' },
      4: { fontStyle: 'bold', textColor: [37, 99, 235] },
      5: { fontStyle: 'bold' },
    },
  });

  const safeName = (student?.name || student?.full_name || 'student').replace(/\s+/g, '_');
  doc.save(`Grade_Sheet_${safeName}.pdf`);
}

/**
 * Format a date string into full readable date and time (e.g. "24 Sep 2026, 10:34 AM")
 */
export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Download a payment receipt PDF.
 * @param {object} details - { reference, amount, term, paidAt }
 */
export function downloadReceiptPDF(details) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const startY = addHeader(doc, 'Official Fee Payment Receipt');

  const formattedDate = details.paidAt
    ? formatDateTime(details.paidAt)
    : details.created_at
    ? formatDateTime(details.created_at)
    : formatDateTime(new Date());

  const rows = [
    ['Reference Code', details.reference || '—'],
    ['Amount Paid', `NGN ${Number(details.amount || 0).toLocaleString()}`],
    ['Academic Term', details.term || details.payment?.term || '—'],
    ['Payment Status', 'CONFIRMED / PAID'],
    ['Date Processed', formattedDate],
  ];

  autoTable(doc, {
    startY,
    body: rows,
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 70 },
      1: { cellWidth: 110 },
    },
    theme: 'grid',
  });

  // Footer note
  const finalY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('This is an official computer-generated receipt. No signature required.', 14, finalY);

  doc.save(`Payment_Receipt_${details.reference || 'receipt'}.pdf`);
}
