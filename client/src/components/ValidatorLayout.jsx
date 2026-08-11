import { useState, useRef, useCallback, useMemo } from 'react';
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlignLeft,
} from 'lucide-react';

function formatJson(raw) {
  const parsed = JSON.parse(raw);
  return JSON.stringify(parsed, null, 2);
}

function CodePanel({ label, value, onChange, placeholder, badge, onFormat, formatError }) {
  const textareaRef = useRef(null);
  const gutterRef = useRef(null);

  const lineCount = Math.max((value || '').split('\n').length, 1);

  const syncScroll = useCallback(() => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const gutterLines = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => (
      <div key={i} className="px-2 text-right">{i + 1}</div>
    )),
    [lineCount]
  );

  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <div className="flex items-center gap-2">
          {formatError && (
            <span className="text-xs text-red-600">{formatError}</span>
          )}
          {badge}
          {onFormat && (
            <button
              type="button"
              onClick={onFormat}
              disabled={!value?.trim()}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              title="Format JSON"
            >
              <AlignLeft size={12} />
              Format
            </button>
          )}
        </div>
      </div>
      <div
        className="flex flex-1 overflow-hidden rounded-lg border border-gray-300 bg-white min-h-[340px]"
      >
        <div
          ref={gutterRef}
          className="w-12 select-none overflow-hidden border-r border-gray-200 bg-gray-50 py-2 font-mono text-xs leading-5 text-gray-400"
        >
          {gutterLines}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          placeholder={placeholder}
          className="flex-1 resize-none overflow-auto px-3 py-2 font-mono text-sm leading-5 text-gray-800 focus:outline-none"
          wrap="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

function ResultPanel({ label, annotatedJson, onEdit, badge }) {
  const { lines, errors } = annotatedJson;

  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {badge}
      </div>
      <div
        role="button"
        tabIndex={0}
        className="flex-1 cursor-text overflow-hidden rounded-lg border border-gray-300 bg-white min-h-[340px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        onClick={onEdit}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onEdit())}
        aria-label="Edit JSON input"
      >
        <div className="h-full overflow-auto min-h-[340px]">
          {lines.map((line, i) => {
            const lineErrs = errors[String(i)];
            return (
              <div key={i}>
                <div className={`flex ${lineErrs ? 'bg-red-100' : ''}`}>
                  <span
                    className={`w-12 shrink-0 select-none border-r border-gray-200 bg-gray-50 px-2 text-right font-mono text-xs leading-5 ${
                      lineErrs ? 'text-red-400' : 'text-gray-400'
                    }`}
                  >
                    {lineErrs ? (
                      <span className="mr-0.5 text-red-500">●</span>
                    ) : null}
                    {i + 1}
                  </span>
                  <pre
                    className={`flex-1 whitespace-pre px-3 font-mono text-sm leading-5 ${
                      lineErrs ? 'text-red-800' : 'text-gray-800'
                    }`}
                  >
                    {line || ' '}
                  </pre>
                </div>
                {lineErrs &&
                  lineErrs.map((msg, j) => (
                    <div key={j} className="flex">
                      <span className="w-12 shrink-0 border-r border-gray-200 bg-gray-50" />
                      <div className="flex-1 px-3 py-0.5">
                        <span className="inline-block rounded border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          {msg}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ErrorSummary({ annotatedJson }) {
  const { errors, unmappedErrors } = annotatedJson;
  const allErrors = [];

  for (const [line, msgs] of Object.entries(errors)) {
    for (const msg of msgs) {
      allErrors.push({ line: parseInt(line, 10) + 1, message: msg });
    }
  }
  for (const msg of unmappedErrors) {
    allErrors.push({ line: null, message: msg });
  }

  if (allErrors.length === 0) return null;

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
        <XCircle size={16} />
        Found {allErrors.length} error{allErrors.length !== 1 ? 's' : ''}
      </div>
      <div className="mt-3 divide-y divide-red-200">
        {allErrors.map((err, i) => (
          <div key={i} className="grid grid-cols-[6rem_1fr] gap-x-3 py-2 text-sm">
            <span className="font-medium text-gray-600">Message:</span>
            <span className="font-medium text-red-600">{err.message}</span>
            {err.line && (
              <>
                <span className="font-medium text-gray-600">Line:</span>
                <span className="text-gray-700">{err.line}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ValidatorLayout({ tool }) {
  const [schemaInput, setSchemaInput] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [schemaFormatError, setSchemaFormatError] = useState(null);
  const [jsonFormatError, setJsonFormatError] = useState(null);

  const handleFormatSchema = () => {
    setSchemaFormatError(null);
    try {
      setSchemaInput(formatJson(schemaInput));
      setResult(null);
    } catch (err) {
      setSchemaFormatError(`Invalid JSON: ${err.message}`);
    }
  };

  const handleFormatJson = () => {
    setJsonFormatError(null);
    try {
      setJsonInput(formatJson(jsonInput));
      setResult(null);
    } catch (err) {
      setJsonFormatError(`Invalid JSON: ${err.message}`);
    }
  };

  const handleValidate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setSchemaFormatError(null);
    setJsonFormatError(null);

    try {
      const res = await fetch(`/api/tools/${tool.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemaInput, jsonInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Request failed (HTTP ${res.status})`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const annotated = result?.annotatedJson;
  const errorCount = annotated
    ? Object.values(annotated.errors).reduce((s, a) => s + a.length, 0) +
      annotated.unmappedErrors.length
    : 0;
  const hasErrors = annotated && errorCount > 0;
  const isValid = annotated && !hasErrors;

  const jsonBadge = hasErrors ? (
    <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
      <XCircle size={14} /> Found {errorCount} error
      {errorCount !== 1 ? 's' : ''}
    </span>
  ) : isValid ? (
    <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
      <CheckCircle2 size={14} /> Valid
    </span>
  ) : null;

  return (
    <form onSubmit={handleValidate} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CodePanel
          label="JSON Schema"
          value={schemaInput}
          onChange={(val) => {
            setSchemaInput(val);
            setSchemaFormatError(null);
            setResult(null);
          }}
          placeholder={
            '{\n  "$schema": "http://json-schema.org/draft-07/schema#",\n  "type": "object",\n  "properties": {\n    "name": { "type": "string" }\n  },\n  "required": ["name"]\n}'
          }
          onFormat={handleFormatSchema}
          formatError={schemaFormatError}
        />

        {annotated ? (
          <ResultPanel
            label="Input JSON"
            annotatedJson={annotated}
            onEdit={() => setResult(null)}
            badge={jsonBadge}
          />
        ) : (
          <CodePanel
            label="Input JSON"
            value={jsonInput}
            onChange={(val) => {
              setJsonInput(val);
              setJsonFormatError(null);
              setResult(null);
            }}
            placeholder={'{\n  "name": "John Doe",\n  "age": 30\n}'}
            badge={jsonBadge}
            onFormat={handleFormatJson}
            formatError={jsonFormatError}
          />
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Validating...
          </>
        ) : (
          <>
            <Play size={16} />
            Validate
          </>
        )}
      </button>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <XCircle size={18} className="mt-0.5 shrink-0 text-red-500" />
          <p>{error}</p>
        </div>
      )}

      {isValid && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-green-500" />
          <p>JSON is valid against the schema.</p>
        </div>
      )}

      {hasErrors && <ErrorSummary annotatedJson={annotated} />}
    </form>
  );
}
