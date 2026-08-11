import { ExternalLink, RefreshCw, UploadCloud, Loader2 } from 'lucide-react';
import { statusStyle, statusLabel, QUICK_STATUS_IDS } from './statusVocab';

function relativeTime(iso) {
  if (!iso) return 'never';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function orderedStatusIds(counts) {
  const ids = Object.keys(counts || {}).map(Number);
  const quick = QUICK_STATUS_IDS.filter((id) => counts[id] != null);
  const rest = ids.filter((id) => !QUICK_STATUS_IDS.includes(id)).sort((a, b) => a - b);
  return [...quick, ...rest];
}

export default function RunToolbar({
  run,
  counts,
  vocab,
  lastSyncedAt,
  dirtyCount,
  syncing,
  uploading,
  onSync,
  onUpload,
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div>
        <a
          href={run.runUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-base font-semibold text-gray-900 hover:text-blue-700"
        >
          {run.runName}
          <ExternalLink size={14} />
        </a>
        <p className="mt-0.5 text-xs text-gray-500">
          Run {run.runId} · Project {run.projectId}
          {run.planId ? ` · Plan ${run.planId}` : ''}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {orderedStatusIds(counts).map((id) => {
            const style = statusStyle(id);
            return (
              <span
                key={id}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.pill}`}
              >
                {counts[id]} {statusLabel(vocab, id)}
              </span>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSync}
              disabled={syncing || uploading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
              Sync
            </button>
            <span className="text-xs text-gray-500">Synced {relativeTime(lastSyncedAt)}</span>
          </div>

          <button
            type="button"
            onClick={onUpload}
            disabled={dirtyCount === 0 || uploading || syncing}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {uploading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <UploadCloud size={16} />
            )}
            {dirtyCount === 0
              ? 'Upload'
              : `Upload ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
