import { useEffect, useRef, useState } from 'react';
import { FileText, Link as LinkIcon, Trash2, Upload } from 'lucide-react';
import API from '../opi';
import { formatDateTime } from '../utils/pdfUtils';

export default function MaterialsManager({ students, onNotify }) {
  const [materials, setMaterials] = useState([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [mode, setMode] = useState('FILE');
  const [form, setForm] = useState({ title: '', description: '', classIds: [], link: '' });
  const [file, setFile] = useState(null);
  const [filterClassId, setFilterClassId] = useState('');
  const fileInputRef = useRef(null);
  const [currentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch (error) {
      return {};
    }
  });

  const classes = [...new Map(
    (Array.isArray(students) ? students : [])
      .filter((student) => student.class_id && student.class_name)
      .map((student) => [String(student.class_id), { id: student.class_id, name: student.class_name }])
  ).values()];
  const materialClasses = [...new Map(
    materials
      .filter((material) => material.class_id && material.class_name)
      .map((material) => [String(material.class_id), { id: material.class_id, name: material.class_name }])
  ).values()];
  const filteredMaterials = materials.filter((material) => !filterClassId || String(material.class_id) === filterClassId);

  const fetchMaterials = async () => {
    try {
      const response = await API.get('/materials');
      setMaterials(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error) {
      setMaterials([]);
      onNotify('error', error.response?.data?.message || 'Could not load learning materials.');
    } finally {
      setMaterialsLoading(false);
    }
  };

  useEffect(() => {
    fetchMaterials();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = new FormData();
    payload.append('title', form.title.trim());
    payload.append('description', form.description.trim());
    form.classIds.forEach((classId) => payload.append('classIds', classId));
    if (mode === 'FILE' && file) payload.append('file', file);
    if (mode === 'LINK') payload.append('link', form.link.trim());

    try {
      setUploading(true);
      await API.post('/materials', payload);
      onNotify('success', 'Learning material shared successfully.');
      setForm({ title: '', description: '', classIds: [], link: '' });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchMaterials();
    } catch (error) {
      onNotify('error', error.response?.data?.message || 'Could not share learning material.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (material) => {
    try {
      setDeletingId(material.id);
      await API.delete(`/materials/${material.id}`);
      setMaterials((current) => current.filter((item) => item.id !== material.id));
      onNotify('success', 'Learning material deleted.');
    } catch (error) {
      onNotify('error', error.response?.data?.message || 'Could not delete learning material.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-bold text-slate-800">Share Materials</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              required
              maxLength={255}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={3}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
            />
          </div>
          <div>
            <span className="mb-2 block text-xs font-semibold text-slate-600">Share with</span>
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.classIds.length === 0}
                  onChange={() => setForm({ ...form, classIds: [] })}
                />
                All students
              </label>
              {classes.map((classItem) => (
                <label key={classItem.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.classIds.includes(String(classItem.id))}
                    onChange={(event) => setForm({
                      ...form,
                      classIds: event.target.checked
                        ? [...form.classIds, String(classItem.id)]
                        : form.classIds.filter((classId) => classId !== String(classItem.id))
                    })}
                  />
                  {classItem.name}
                </label>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">Material type</span>
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Material type">
              <button
                type="button"
                onClick={() => setMode('FILE')}
                aria-pressed={mode === 'FILE'}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${mode === 'FILE' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}
              >
                <Upload className="h-4 w-4" /> Upload PDF
              </button>
              <button
                type="button"
                onClick={() => setMode('LINK')}
                aria-pressed={mode === 'LINK'}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${mode === 'LINK' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}
              >
                <LinkIcon className="h-4 w-4" /> Paste link
              </button>
            </div>
          </div>
          {mode === 'FILE' ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">PDF file (max 8 MB)</label>
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf,application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                required
                className="w-full rounded-lg border border-slate-300 p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Link</label>
              <input
                type="url"
                value={form.link}
                onChange={(event) => setForm({ ...form, link: event.target.value })}
                placeholder="https://..."
                required
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={uploading || !form.title.trim() || (mode === 'FILE' ? !file : !form.link.trim())}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className={`h-4 w-4 ${uploading ? 'animate-pulse' : ''}`} />
            {uploading ? 'Sharing...' : 'Share Material'}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-bold text-slate-800">Shared Materials</h3>
        <label className="mb-3 block text-xs font-semibold text-slate-600">
          Filter by class
          <select value={filterClassId} onChange={(event) => setFilterClassId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal">
            <option value="">All classes</option>
            {materialClasses.map((classItem) => <option key={classItem.id} value={classItem.id}>{classItem.name}</option>)}
          </select>
        </label>
        {materialsLoading ? (
          <p className="text-sm text-slate-500">Loading materials...</p>
        ) : filteredMaterials.length === 0 ? (
          <p className="text-sm text-slate-500">No materials have been shared yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredMaterials.map((material) => (
              <article key={material.id} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                    <h4 className="break-words font-semibold text-slate-800">{material.title}</h4>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">{material.kind}</span>
                  </div>
                  {material.description && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{material.description}</p>}
                  <p className="mt-2 text-xs text-slate-500">{material.class_name || 'All students'} · {formatDateTime(material.created_at)} · {material.uploader_name}</p>
                  {material.file_name && <p className="mt-1 break-all text-xs text-slate-400">{material.file_name}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a href={material.url} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100">Open</a>
                  {(currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || Number(material.uploaded_by) === Number(currentUser.id)) && (
                    <button
                      type="button"
                      onClick={() => handleDelete(material)}
                      disabled={deletingId === material.id}
                      aria-label={`Delete ${material.title}`}
                      title="Delete material"
                      className="rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
