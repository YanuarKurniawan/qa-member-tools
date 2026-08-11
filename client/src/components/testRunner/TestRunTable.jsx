import { ChevronUp, ChevronDown, Info } from 'lucide-react';
import { statusStyle, statusLabel, priorityLabel } from './statusVocab';

export function Highlight({ text, query }) {
  if (!query || !text) return text || '';
  const needle = query.toLowerCase();
  const haystack = text.toLowerCase();
  const parts = [];
  let cursor = 0;
  for (;;) {
    const found = haystack.indexOf(needle, cursor);
    if (found === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (found > cursor) parts.push(text.slice(cursor, found));
    parts.push(
      <mark key={found} className="rounded bg-amber-100 px-0.5 text-amber-900">
        {text.slice(found, found + query.length)}
      </mark>
    );
    cursor = found + query.length;
  }
  return <>{parts}</>;
}

const SORT_COLUMNS = [
  { key: 'caseId', label: 'Test ID' },
  { key: 'title', label: 'Test Name' },
  { key: 'priorityId', label: 'Priority' },
  { key: 'statusId', label: 'Status' },
  { key: 'remoteStatusId', label: 'Latest TestRail' },
];

function StatusPill({ statusId, vocab, muted = false }) {
  const style = statusStyle(statusId);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.pill} ${muted ? 'opacity-70' : ''}`}
    >
      {statusLabel(vocab, statusId)}
    </span>
  );
}

function rowClassName(test, activeTestId, focusedTestId) {
  const classes = ['cursor-pointer transition-colors'];
  if (test.testId === activeTestId) {
    classes.push('bg-blue-50/60');
  } else {
    classes.push('hover:bg-gray-50');
  }
  if (test.testId === focusedTestId) {
    classes.push('ring-1 ring-inset ring-blue-400');
  }
  if (test.uploadError) {
    classes.push('border-l-2 border-l-red-500');
  } else if (test.conflicts.length > 0) {
    classes.push('border-l-2 border-l-amber-500');
  } else if (test.dirtyFields.length > 0) {
    classes.push('border-l-2 border-l-blue-500');
  }
  return classes.join(' ');
}

export default function TestRunTable({
  tests,
  vocab,
  sort,
  onSortChange,
  query,
  activeTestId,
  focusedTestId,
  onRowClick,
  onPatch,
  readOnlyResults,
}) {
  void onPatch;
  void readOnlyResults;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              {SORT_COLUMNS.map(({ key, label }) => (
                <th key={key} className="whitespace-nowrap px-4 py-2.5 font-medium">
                  <button
                    type="button"
                    onClick={() => onSortChange(key)}
                    className="inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {label}
                    {sort.key === key &&
                      (sort.dir === 'asc' ? (
                        <ChevronUp size={12} />
                      ) : (
                        <ChevronDown size={12} />
                      ))}
                  </button>
                </th>
              ))}
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">Comments</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tests.map((test) => (
              <tr
                key={test.testId}
                className={rowClassName(test, activeTestId, focusedTestId)}
                onClick={() => onRowClick(test.testId)}
              >
                <td className="whitespace-nowrap px-4 py-2.5">
                  <a
                    href={`https://tiket.testrail.com/index.php?/cases/view/${test.caseId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-blue-700 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    C{test.caseId}
                  </a>
                </td>
                <td className="px-4 py-2.5 text-gray-800">
                  <span className="inline-flex items-center gap-1">
                    <Highlight text={test.title} query={query} />
                    {test.titleDivergedFromRun && (
                      <Info
                        size={12}
                        className="shrink-0 text-gray-400"
                        title="Case renamed. TestRail's run view keeps the original title until a new run is created."
                      />
                    )}
                  </span>
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-2.5 ${
                    test.priorityId === 3 || test.priorityId === 4
                      ? 'font-medium text-gray-900'
                      : 'text-gray-700'
                  }`}
                >
                  {priorityLabel(vocab, test.priorityId)}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <StatusPill statusId={test.statusId} vocab={vocab} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <StatusPill statusId={test.remoteStatusId} vocab={vocab} muted />
                </td>
                <td className="px-4 py-2.5">
                  {test.comment ? (
                    <span className="line-clamp-1 text-gray-600">{test.comment}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
