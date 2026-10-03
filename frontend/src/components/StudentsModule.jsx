import React, { useState } from 'react';
import { Plus, X, Calendar, User, Phone, GraduationCap, Trash2, Upload, CheckCircle, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import API from '../opi';

const normalizeHeader = (value = '') => String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const firstNonEmpty = (...values) => values.find((value) => String(value ?? '').trim() !== '');

const toIsoDate = (value) => {
  if (!value && value !== 0) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y) {
      const month = String(parsed.m || 1).padStart(2, '0');
      const day = String(parsed.d || 1).padStart(2, '0');
      return `${parsed.y}-${month}-${day}`;
    }

    const fallback = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(fallback.getTime())) {
      return fallback.toISOString().slice(0, 10);
    }
    return '';
  }

  const text = String(value).trim();
  if (!text) return '';

  const asDate = new Date(text);
  if (!Number.isNaN(asDate.getTime())) {
    return asDate.toISOString().slice(0, 10);
  }

  return text;
};

const normalizeStudentImportRow = (rawRow = {}) => {
  const normalized = Object.entries(rawRow).reduce((acc, [key, value]) => {
    acc[normalizeHeader(key)] = value;
    return acc;
  }, {});

  const fullName = firstNonEmpty(
    normalized.fullname,
    normalized.studentfullname,
    normalized.name,
    normalized.studentname,
    normalized.fullnames,
    normalized.fullname1
  );

  const dateOfBirth = firstNonEmpty(
    normalized.dateofbirth,
    normalized.dob,
    normalized.birthdate,
    normalized.dateofbirths,
    normalized.studentdob,
    normalized.birthday
  );

  const className = firstNonEmpty(
    normalized.classname,
    normalized.class,
    normalized.studentclass,
    normalized.level,
    normalized.classlevel,
    normalized.grade
  );

  return {
    fullName: String(fullName ?? '').trim(),
    dateOfBirth: toIsoDate(dateOfBirth),
    className: String(className ?? '').trim()
  };
};

const escapeCsvValue = (value = '') => `"${String(value).replace(/"/g, '""')}"`;

const parseExcelOrCsvFile = (file) => new Promise((resolve, reject) => {
  if (!file) {
    reject(new Error('Please select a spreadsheet or CSV file.'));
    return;
  }

  const fileName = String(file.name || '').toLowerCase();
  const isCsv = fileName.endsWith('.csv');

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const binaryData = event.target?.result;
      const workbook = XLSX.read(binaryData, {
        type: isCsv ? 'string' : 'array',
        cellDates: true,
        raw: false
      });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
      const parsedRows = rows
        .map((row) => normalizeStudentImportRow(row))
        .filter((row) => row.fullName || row.dateOfBirth || row.className);

      resolve(parsedRows);
    } catch (error) {
      reject(error);
    }
  };

  reader.onerror = () => reject(new Error('Could not read the selected file.'));

  if (isCsv) {
    reader.readAsText(file);
  } else {
    reader.readAsArrayBuffer(file);
  }
});

export default function StudentsModule({ students, loading, onAddStudent, onDeleteStudent }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [studentForm, setStudentForm] = useState({
    fullName: '',
    dateOfBirth: '',
    className: 'JSS 1',
    guardianPhone: ''
  });
  const [importRows, setImportRows] = useState([]);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState([]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onAddStudent(studentForm, () => {
      setIsModalOpen(false);
      setStudentForm({ fullName: '', dateOfBirth: '', className: 'JSS 1', guardianPhone: '' });
    });
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError('');
    setImportResults([]);

    try {
      const parsedRows = await parseExcelOrCsvFile(file);
      if (parsedRows.length === 0) {
        setImportRows([]);
        setImportError('No usable student rows were found. Check the file headers and make sure the spreadsheet includes name, DOB, and class columns.');
        return;
      }

      setImportRows(parsedRows);
    } catch (error) {
      setImportRows([]);
      setImportError(error.message || 'The selected spreadsheet could not be parsed.');
    } finally {
      event.target.value = '';
    }
  };

  const handleBulkImport = async () => {
    if (!importRows.length) return;

    const invalidRows = importRows
      .map((row, index) => ({ ...row, index }))
      .filter((row) => !row.fullName || !row.dateOfBirth || !row.className);

    if (invalidRows.length > 0) {
      const firstInvalid = invalidRows[0];
      setImportError(`Row ${firstInvalid.index + 2} is missing a required full name, date of birth, or class.`);
      setImportResults(
        invalidRows.map((row) => ({
          name: row.fullName || `Row ${row.index + 2}`,
          admissionNumber: '',
          status: 'failed',
          reason: 'Missing required full name, date of birth, or class.'
        }))
      );
      return;
    }

    setImporting(true);
    setImportError('');

    try {
      const payload = importRows.map((row) => ({
        fullName: row.fullName,
        dateOfBirth: row.dateOfBirth,
        className: row.className
      }));

      const response = await API.post('/auth/admin/import-students', payload);
      const importedStudents = Array.isArray(response.data?.students) ? response.data.students : [];

      const results = payload.map((row, index) => {
        const created = importedStudents[index];
        return {
          name: row.fullName,
          admissionNumber: created?.admission_number || '',
          status: created ? 'success' : 'failed',
          reason: created ? '' : 'Import response missing this record.'
        };
      });

      setImportResults(results);
      setImportRows([]);
    } catch (error) {
      const message = error.response?.data?.message || error.response?.data?.error || 'Bulk student import failed.';
      setImportError(message);
      setImportResults(
        importRows.map((row) => ({
          name: row.fullName,
          admissionNumber: '',
          status: 'failed',
          reason: message
        }))
      );
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadImportResults = () => {
    if (!importResults.length) return;

    const csvRows = [
      ['Name', 'Admission Number', 'Status', 'Reason'],
      ...importResults.map((row) => [row.name, row.admissionNumber, row.status, row.reason])
    ];

    const csvContent = csvRows
      .map((row) => row.map((cell) => escapeCsvValue(cell)).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'student-admission-results.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Enrolled Students</h3>
          <p className="text-xs text-gray-500">Official student roster and admission numbers</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2 transition shadow"
        >
          <Plus className="h-4 w-4" /> Enrol New Student
        </button>
      </div>

      <div className="mb-8 rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-base font-bold text-slate-800">Import Students</h4>
            <p className="text-xs text-slate-600">Upload .xlsx, .xls, or .csv files and review the first 10 rows before submitting.</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow hover:bg-blue-700">
            <Upload className="h-4 w-4" />
            Choose Spreadsheet
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} className="hidden" />
          </label>
        </div>

        {importError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {importError}
          </div>
        )}

        {importRows.length > 0 && (
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-slate-600">Previewing the first 10 parsed rows</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setImportRows([])}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleBulkImport}
                  disabled={importing}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {importing ? 'Importing...' : 'Submit Imported Students'}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">Full Name</th>
                    <th className="px-3 py-2 font-semibold">Date of Birth</th>
                    <th className="px-3 py-2 font-semibold">Class</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {importRows.slice(0, 10).map((row, index) => (
                    <tr key={`${row.fullName || 'row'}-${index}`}>
                      <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                      <td className="px-3 py-2 font-medium">{row.fullName || '—'}</td>
                      <td className="px-3 py-2">{row.dateOfBirth || '—'}</td>
                      <td className="px-3 py-2">{row.className || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {importResults.length > 0 && (
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h5 className="text-sm font-bold text-slate-800">Import Results</h5>
              <button
                type="button"
                onClick={handleDownloadImportResults}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" /> Download Results as CSV
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Student Name</th>
                    <th className="px-3 py-2 font-semibold">Admission Number</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {importResults.map((result, index) => (
                    <tr key={`${result.name || 'result'}-${index}`}>
                      <td className="px-3 py-2 font-medium">{result.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-blue-700">{result.admissionNumber || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          result.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {result.status === 'success' ? 'Success' : 'Failed'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">{result.reason || 'Imported successfully.'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm py-8 text-center animate-pulse">Loading student directory...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="pb-3 font-semibold">Admission No</th>
                <th className="pb-3 font-semibold">Full Name</th>
                <th className="pb-3 font-semibold">Class</th>
                <th className="pb-3 font-semibold">Date of Birth</th>
                <th className="pb-3 font-semibold">Guardian Phone</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {(Array.isArray(students) ? students : []).length > 0 ? (
                (Array.isArray(students) ? students : []).map((student) => (
                  <tr key={student.id} className="hover:bg-slate-50/80">
                    <td className="py-3 font-mono font-bold text-blue-600">{student.admission_no}</td>
                    <td className="py-3 font-medium text-slate-900">{student.name}</td>
                    <td className="py-3">{student.class_name}</td>
                    <td className="py-3 text-xs text-slate-500">
                      {student.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="py-3 text-xs text-slate-500">{student.guardian_phone || 'N/A'}</td>
                    <td className="py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        student.user_id ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {student.user_id ? 'Claimed' : 'Pre-Enrolled'}
                      </span>
                    </td>
                    <td className="py-3">
                      <button type="button" onClick={() => onDeleteStudent(student)} title={`Delete ${student.name}`} aria-label={`Delete ${student.name}`} className="rounded p-1.5 text-red-600 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="py-10 text-center text-gray-400">
                    No student records found in database. Click <strong>"Enrol New Student"</strong> to add the first record.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ENROL STUDENT MODAL POPUP */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl border border-gray-200">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Enrol New Student</h3>
                <p className="text-xs text-gray-500">Generates official Admission Number for student self-registration</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Student Full Name *</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <User className="h-4 w-4" />
                  </div>
                  <input 
                    type="text" 
                    value={studentForm.fullName} 
                    onChange={(e) => setStudentForm({ ...studentForm, fullName: e.target.value })}
                    placeholder="e.g. David Adebayo"
                    required 
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Date of Birth *</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <input 
                    type="date" 
                    value={studentForm.dateOfBirth} 
                    onChange={(e) => setStudentForm({ ...studentForm, dateOfBirth: e.target.value })}
                    required 
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Class</label>
                  <select 
                    value={studentForm.className} 
                    onChange={(e) => setStudentForm({ ...studentForm, className: e.target.value })}
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="JSS 1">JSS 1</option>
                    <option value="JSS 2">JSS 2</option>
                    <option value="JSS 3">JSS 3</option>
                    <option value="SS 1">SS 1</option>
                    <option value="SS 2">SS 2</option>
                    <option value="SS 3">SS 3</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Guardian Phone</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Phone className="h-4 w-4" />
                    </div>
                    <input 
                      type="tel" 
                      value={studentForm.guardianPhone} 
                      onChange={(e) => setStudentForm({ ...studentForm, guardianPhone: e.target.value })}
                      placeholder="08012345678"
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-gray-100">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition shadow"
                >
                  Enrol Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}