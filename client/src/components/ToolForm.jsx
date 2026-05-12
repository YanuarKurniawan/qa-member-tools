import { useState } from 'react';
import { Play, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import CsvUpload from './CsvUpload';
import LogViewer from './LogViewer';
import ResultsTable from './ResultsTable';

export default function ToolForm({ tool }) {
  const [formData, setFormData] = useState({});
  const [csvFile, setCsvFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [previewData, setPreviewData] = useState(null);

  const inputDef = tool.input || {};
  const outputDef = tool.output || {};
  const toolType = inputDef.type || 'form';
  const allFields = [...(inputDef.fields || []), ...(inputDef.extraFields || [])];

  const handleFieldChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setPreviewData(null);

    try {
      let res;
      const endpoint = `/api/tools/${tool.id}`;

      if (toolType === 'csv' || toolType === 'csv+form') {
        if (!csvFile) {
          setError('Please upload a CSV file');
          setLoading(false);
          return;
        }
        const fd = new FormData();
        fd.append('file', csvFile);
        allFields.forEach((f) => {
          if (formData[f.name] !== undefined) {
            fd.append(f.name, formData[f.name]);
          }
        });
        res = await fetch(endpoint, { method: 'POST', body: fd });
      } else {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
      }

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server returned non-JSON response (HTTP ${res.status})`);
      }

      if (!res.ok) {
        setError(data.error || `Request failed with status ${res.status}`);
        if (data.logs) setResult({ logs: data.logs, results: [] });
      } else if (outputDef.hasConfirmStep && data.preview) {
        setPreviewData(data);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!previewData) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/tools/${tool.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...previewData.userData,
          env: formData.env,
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server returned non-JSON response (HTTP ${res.status})`);
      }
      if (!res.ok) {
        setError(data.error || 'Confirmation failed');
      } else {
        setResult(data);
        setPreviewData(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {(toolType === 'csv' || toolType === 'csv+form') && (
        <CsvUpload
          csvInfo={inputDef.csvInfo}
          csvExample={inputDef.csvExample}
          file={csvFile}
          onFileSelect={setCsvFile}
        />
      )}

      {allFields.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {allFields.map((field) => (
            <div
              key={field.name}
              className={field.type === 'checkbox' ? 'sm:col-span-2' : ''}
            >
              {field.type === 'checkbox' ? (
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={!!formData[field.name]}
                    onChange={(e) =>
                      handleFieldChange(field.name, e.target.checked)
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    {field.label}
                  </span>
                  {field.description && (
                    <span className="text-xs text-gray-400">
                      — {field.description}
                    </span>
                  )}
                </label>
              ) : field.type === 'select' ? (
                <>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    {field.label}
                  </label>
                  <select
                    value={formData[field.name] || field.defaultValue || ''}
                    onChange={(e) =>
                      handleFieldChange(field.name, e.target.value)
                    }
                    required={field.required}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select...</option>
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={formData[field.name] || ''}
                    onChange={(e) =>
                      handleFieldChange(field.name, e.target.value)
                    }
                    required={field.required}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Play size={16} />
            Run Tool
          </>
        )}
      </button>

      {previewData && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600" />
            <h4 className="font-semibold text-amber-800">Confirm Deletion</h4>
          </div>
          <div className="mb-4 space-y-1 text-sm text-amber-900">
            {Object.entries(previewData.userData || {}).map(([key, val]) => (
              <p key={key}>
                <span className="font-medium">{key}:</span> {String(val)}
              </p>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <XCircle size={14} />
              )}
              Yes, Delete
            </button>
            <button
              type="button"
              onClick={() => setPreviewData(null)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <XCircle size={18} className="mt-0.5 shrink-0 text-red-500" />
          <p>{error}</p>
        </div>
      )}

      {result && !error && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-green-500" />
          <p>
            {result.message ||
              `Completed successfully. ${result.results?.length || 0} items processed.`}
          </p>
        </div>
      )}

      {result?.logs && <LogViewer logs={result.logs} />}
      {result?.results && result.results.length > 0 && (
        <ResultsTable results={result.results} />
      )}
    </form>
  );
}
