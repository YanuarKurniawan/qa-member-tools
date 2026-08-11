import { useRef, useEffect } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react';

const typeIcons = {
  info: <Info size={14} className="mt-0.5 shrink-0 text-blue-400" />,
  success: <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-green-400" />,
  error: <XCircle size={14} className="mt-0.5 shrink-0 text-red-400" />,
  warn: <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />,
};

const typeColors = {
  info: 'text-slate-300',
  success: 'text-green-300',
  error: 'text-red-300',
  warn: 'text-amber-300',
};

export default function LogViewer({ logs = [] }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  if (logs.length === 0) return null;

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Output Log
        </span>
        <span className="text-xs text-slate-500">{logs.length} entries</span>
      </div>
      <div className="max-h-80 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
        {logs.map((log, i) => (
          <div key={i} className="flex items-start gap-2 py-0.5">
            {typeIcons[log.type] || typeIcons.info}
            <span className={typeColors[log.type] || typeColors.info}>
              {log.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
