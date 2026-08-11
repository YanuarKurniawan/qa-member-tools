import { useState, useRef, useCallback } from 'react';
import { Play, Loader2, CheckCircle2, XCircle, AlertTriangle, Copy, Check, RotateCcw, Square } from 'lucide-react';
import CsvUpload from './CsvUpload';
import LogViewer from './LogViewer';
import ResultsTable from './ResultsTable';
import ValidatorLayout from './ValidatorLayout';
import JsonPathFinderLayout from './JsonPathFinderLayout';

function AnnotatedJsonView({ annotatedJson }) {
  const { lines, errors, unmappedErrors } = annotatedJson;
  const errorCount =
    Object.values(errors).reduce((sum, arr) => sum + arr.length, 0) +
    unmappedErrors.length;
  const isValid = errorCount === 0;

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Validation Result
        </span>
        {isValid ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
            <CheckCircle2 size={14} /> Valid
          </span>
        ) : (
          <span className="text-xs font-medium text-red-400">
            {errorCount} error{errorCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="max-h-[32rem] overflow-auto font-mono text-xs leading-relaxed">
        {lines.map((line, i) => {
          const lineErrs = errors[String(i)];
          return (
            <div key={i}>
              <div
                className={`flex ${lineErrs ? 'bg-red-950/40' : 'hover:bg-slate-800/30'}`}
              >
                <span className="w-10 shrink-0 select-none border-r border-slate-800 py-px pr-3 text-right text-slate-600">
                  {i + 1}
                </span>
                <pre
                  className={`flex-1 whitespace-pre px-3 py-px ${lineErrs ? 'text-red-300' : 'text-slate-300'}`}
                >
                  {line}
                </pre>
              </div>
              {lineErrs &&
                lineErrs.map((msg, j) => (
                  <div
                    key={j}
                    className="flex border-l-2 border-red-500 bg-red-950/20 pl-10"
                  >
                    <span className="px-3 py-px text-xs text-red-400">
                      ↳ {msg}
                    </span>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
      {unmappedErrors.length > 0 && (
        <div className="space-y-1.5 border-t border-slate-700 px-4 py-2.5">
          <span className="text-xs font-medium text-slate-300">
            General errors:
          </span>
          {unmappedErrors.map((msg, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs text-red-400"
            >
              <XCircle size={12} className="mt-0.5 shrink-0" />
              <span>{msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SchemaOutput({ schema }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(schema);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Generated Schema
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          {copied ? (
            <>
              <Check size={14} className="text-green-400" />
              Copied!
            </>
          ) : (
            <>
              <Copy size={14} />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="max-h-[32rem] overflow-auto p-4 font-mono text-xs leading-relaxed text-emerald-300">
        {schema}
      </pre>
    </div>
  );
}

const STATUS_MESSAGES = {
  400: 'Invalid request. Check your inputs and try again.',
  401: 'Authentication required. Check your credentials.',
  403: 'Permission denied. You may not have access to this environment.',
  404: 'Not found. The target may have been removed or the endpoint is incorrect.',
  408: 'Request timed out. The target environment may be slow or unreachable.',
  422: 'Invalid data. Check that all fields contain valid values.',
  429: 'Too many requests. Wait a moment and try again.',
  500: 'Server error. Try again; if it persists, check the target environment.',
  502: 'Server temporarily unreachable. Try again in a few seconds.',
  503: 'Server temporarily unavailable. Try again in a few seconds.',
  504: 'Gateway timeout. The target environment may be slow or unreachable.',
};

function classifyError(status, serverMessage) {
  if (!status) {
    const isNetwork = /fetch|network|abort|timeout|econnrefused/i.test(serverMessage || '');
    return {
      message: isNetwork
        ? 'Could not reach the server. Check your connection and try again.'
        : serverMessage || 'Something went wrong.',
      detail: isNetwork ? serverMessage : null,
      retryable: true,
    };
  }

  const humanMessage = STATUS_MESSAGES[status]
    || (status >= 500 ? 'Server error. Try again.' : `Request failed (HTTP ${status}).`);

  return {
    message: serverMessage || humanMessage,
    detail: `HTTP ${status}`,
    retryable: status >= 500 || status === 408 || status === 429,
  };
}

export default function ToolForm({ tool }) {
  const [formData, setFormData] = useState({});
  const [csvFile, setCsvFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [streamLogs, setStreamLogs] = useState([]);
  const [streamProgress, setStreamProgress] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const formRef = useRef(null);
  const lastActionRef = useRef('submit');
  const abortRef = useRef(null);

  const inputDef = tool.input || {};

  if (inputDef.layout === 'validator') {
    return <ValidatorLayout tool={tool} />;
  }
  if (inputDef.layout === 'json-path-finder') {
    return <JsonPathFinderLayout tool={tool} />;
  }
  const outputDef = tool.output || {};
  const toolType = inputDef.type || 'form';
  const allFields = [...(inputDef.fields || []), ...(inputDef.extraFields || [])];
  const isStreamable = tool.streamable;

  const handleFieldChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const handleStreamSubmit = async (e) => {
    e.preventDefault();
    lastActionRef.current = 'submit';
    setLoading(true);
    setStreaming(true);
    setError(null);
    setResult(null);
    setStreamLogs([]);
    setStreamProgress(null);

    if (toolType === 'csv' || toolType === 'csv+form') {
      if (!csvFile) {
        setError({ message: 'Please upload a CSV file.', detail: null, retryable: false });
        setLoading(false);
        setStreaming(false);
        return;
      }
    }

    const fd = new FormData();
    if (csvFile) fd.append('file', csvFile);
    allFields.forEach((f) => {
      if (formData[f.name] !== undefined) {
        fd.append(f.name, formData[f.name]);
      }
    });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/tools/${tool.id}/stream`, {
        method: 'POST',
        body: fd,
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(classifyError(res.status, data?.error));
        setLoading(false);
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const payload = JSON.parse(line.slice(6));
              if (eventType === 'log') {
                setStreamLogs((prev) => [...prev, payload]);
              } else if (eventType === 'progress') {
                setStreamProgress(payload);
              } else if (eventType === 'result') {
                setResult((prev) => ({ ...prev, results: payload.results }));
              } else if (eventType === 'done') {
                setStreamProgress((prev) => prev ? { ...prev, phase: payload.stopped ? 'stopped' : 'done' } : prev);
              } else if (eventType === 'error') {
                setError({ message: payload.message, detail: null, retryable: true });
              }
            } catch {}
            eventType = null;
          } else if (line === '') {
            eventType = null;
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(classifyError(null, err.message));
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
      setStreaming(false);
    }
  };

  const handleSubmit = async (e) => {
    if (isStreamable) {
      return handleStreamSubmit(e);
    }

    e.preventDefault();
    lastActionRef.current = 'submit';
    setLoading(true);
    setError(null);
    setResult(null);
    setPreviewData(null);

    try {
      let res;
      const endpoint = `/api/tools/${tool.id}`;

      if (toolType === 'csv' || toolType === 'csv+form') {
        if (!csvFile) {
          setError({ message: 'Please upload a CSV file.', detail: null, retryable: false });
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
        setError(classifyError(res.status, null));
        return;
      }

      if (!res.ok) {
        setError(classifyError(res.status, data.error));
        if (data.logs) setResult({ logs: data.logs, results: [] });
      } else if (outputDef.hasConfirmStep && data.preview) {
        setPreviewData(data);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(classifyError(null, err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!previewData) return;
    lastActionRef.current = 'confirm';
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
        setError(classifyError(res.status, null));
        return;
      }
      if (!res.ok) {
        setError(classifyError(res.status, data.error));
      } else {
        setResult(data);
        setPreviewData(null);
      }
    } catch (err) {
      setError(classifyError(null, err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    if (lastActionRef.current === 'confirm') {
      handleConfirm();
    } else {
      formRef.current?.requestSubmit();
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
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
              className={
                field.type === 'checkbox'
                  ? 'sm:col-span-2'
                  : field.type === 'textarea' && inputDef.layout !== 'side-by-side'
                    ? 'sm:col-span-2'
                    : ''
              }
            >
              {field.type === 'textarea' ? (
                <>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    {field.label}
                  </label>
                  <textarea
                    placeholder={field.placeholder}
                    value={formData[field.name] || ''}
                    onChange={(e) =>
                      handleFieldChange(field.name, e.target.value)
                    }
                    required={field.required}
                    rows={field.rows || 10}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {field.description && (
                    <p className="mt-1 text-xs text-gray-500">
                      {field.description}
                    </p>
                  )}
                </>
              ) : field.type === 'checkbox' ? (
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
                    <span className="text-xs text-gray-500">
                      ({field.description})
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

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
        {streaming && (
          <button
            type="button"
            onClick={handleStop}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          >
            <Square size={14} fill="currentColor" />
            Stop
          </button>
        )}
      </div>

      {streamProgress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">
              {streamProgress.phase === 'done'
                ? 'Completed'
                : streamProgress.phase === 'stopped'
                  ? 'Stopped'
                  : `Processing row ${streamProgress.current} of ${streamProgress.total}`}
            </span>
            <span className="text-xs text-gray-500">
              {streamProgress.total > 0
                ? `${Math.round((streamProgress.current / streamProgress.total) * 100)}%`
                : '0%'}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                streamProgress.phase === 'stopped'
                  ? 'bg-amber-500'
                  : streamProgress.phase === 'done'
                    ? 'bg-green-500'
                    : 'bg-blue-600'
              }`}
              style={{
                width: `${streamProgress.total > 0 ? (streamProgress.current / streamProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

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
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <XCircle size={14} />
              )}
              Delete
            </button>
            <button
              type="button"
              onClick={() => setPreviewData(null)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="flex items-start gap-2">
            <XCircle size={18} className="mt-0.5 shrink-0 text-red-500" />
            <div className="flex-1 space-y-2">
              <p>{error.message}</p>
              {error.detail && (
                <details className="text-xs text-red-600">
                  <summary className="cursor-pointer font-medium hover:text-red-700">
                    Technical details
                  </summary>
                  <pre className="mt-1 whitespace-pre-wrap rounded bg-red-100/60 px-2 py-1.5 font-mono">
                    {error.detail}
                  </pre>
                </details>
              )}
              {error.retryable && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                >
                  <RotateCcw size={12} />
                  Try again
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {result && !error && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-green-500" />
          <p>
            {result.message ||
              `Completed successfully. ${result.results?.length || 0} items processed.`}
          </p>
        </div>
      )}

      {result?.schema && <SchemaOutput schema={result.schema} />}
      {result?.annotatedJson && (
        <AnnotatedJsonView annotatedJson={result.annotatedJson} />
      )}

      {streamLogs.length > 0 && <LogViewer logs={streamLogs} />}
      {result?.logs && !isStreamable && <LogViewer logs={result.logs} />}
      {result?.results && result.results.length > 0 && (
        <ResultsTable results={result.results} />
      )}
    </form>
  );
}
