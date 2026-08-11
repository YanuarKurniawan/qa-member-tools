import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Info, Pencil } from 'lucide-react';
import { statusStyle, statusLabel, priorityLabel } from './statusVocab';
import StatusCell from './StatusCell';

export function Highlight({ text, needle }) {
  if (!needle || !text) return text || '';
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
        {text.slice(found, found + needle.length)}
      </mark>
    );
    cursor = found + needle.length;
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

function DirtyDot({ title }) {
  return (
    <span className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" title={title} />
  );
}

function rowClassName(test, activeTestId, focusedTestId) {
  const classes = ['group cursor-pointer transition-colors'];
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
  searchNeedle,
  activeTestId,
  focusedTestId,
  onRowClick,
  onPatch,
  readOnlyResults,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [commentLocal, setCommentLocal] = useState({});
  const [commentExpanded, setCommentExpanded] = useState({});

  useEffect(() => {
    if (editingId == null) return;
    const test = tests.find((t) => t.testId === editingId);
    if (!test) setEditingId(null);
  }, [tests, editingId]);

  useEffect(() => {
    setCommentLocal((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const test of tests) {
        if (test.testId in next && next[test.testId] === (test.comment || '')) {
          delete next[test.testId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tests]);

  const startTitleEdit = (test, event) => {
    event.stopPropagation();
    setEditingId(test.testId);
    setEditValue(test.title);
  };

  const commitTitle = (test) => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === test.title) {
      setEditingId(null);
      return;
    }
    onPatch(test.testId, { title: trimmed });
    setEditingId(null);
  };

  const cancelTitle = () => {
    setEditingId(null);
  };

  const commentValue = (test) =>
    test.testId in commentLocal ? commentLocal[test.testId] : test.comment || '';

  const commitComment = (test) => {
    const value = commentValue(test);
    const serverValue = test.comment || '';
    if (value === serverValue) {
      setCommentLocal((prev) => {
        if (!(test.testId in prev)) return prev;
        const next = { ...prev };
        delete next[test.testId];
        return next;
      });
      return;
    }
    onPatch(test.testId, { comment: value || null });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              {SORT_COLUMNS.map(({ key, label }) => (
                <th
                  key={key}
                  className={`px-4 py-2.5 font-medium ${
                    key === 'title' ? 'w-full max-w-0' : 'w-[1%] whitespace-nowrap'
                  }`}
                >
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
              <th className="w-[1%] whitespace-nowrap px-4 py-2.5 font-medium">Comments</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tests.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  No tests match your filters.
                </td>
              </tr>
            ) : (
            tests.map((test) => (
              <tr
                key={test.testId}
                className={rowClassName(test, activeTestId, focusedTestId)}
                onClick={() => onRowClick(test.testId)}
              >
                <td className="w-[1%] whitespace-nowrap px-4 py-2.5">
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
                <td className="w-full max-w-0 whitespace-nowrap px-4 py-2.5 text-gray-800">
                  {editingId === test.testId ? (
                    <input
                      type="text"
                      value={editValue}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitTitle(test);
                        if (e.key === 'Escape') cancelTitle();
                      }}
                      onBlur={() => commitTitle(test)}
                      className="w-full rounded border border-blue-400 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  ) : (
                    <span
                      className="inline-flex items-center gap-1"
                      onClick={(e) => startTitleEdit(test, e)}
                    >
                      <Highlight text={test.title} needle={searchNeedle} />
                      {test.titleDivergedFromRun && (
                        <Info
                          size={12}
                          className="shrink-0 text-gray-400"
                          title="Case renamed. TestRail's run view keeps the original title until a new run is created."
                        />
                      )}
                      <Pencil size={12} className="invisible text-gray-400 group-hover:visible" />
                      {test.dirtyFields.includes('title') && (
                        <DirtyDot title="Unsaved title change" />
                      )}
                    </span>
                  )}
                </td>
                <td
                  className={`w-[1%] whitespace-nowrap px-4 py-2.5 ${
                    test.priorityId === 3 || test.priorityId === 4
                      ? 'font-medium text-gray-900'
                      : 'text-gray-700'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="inline-flex items-center">
                    <select
                      value={test.priorityId}
                      onChange={(e) =>
                        onPatch(test.testId, { priorityId: Number(e.target.value) })
                      }
                      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    >
                      {(vocab?.priorities || []).map((priority) => (
                        <option key={priority.id} value={priority.id}>
                          {priority.label}
                        </option>
                      ))}
                    </select>
                    {test.dirtyFields.includes('priorityId') && (
                      <DirtyDot title={`Unsaved: ${priorityLabel(vocab, test.priorityId)}`} />
                    )}
                  </span>
                </td>
                <td className="w-[1%] whitespace-nowrap px-4 py-2.5">
                  <StatusCell
                    test={test}
                    vocab={vocab}
                    disabled={readOnlyResults}
                    onPatch={onPatch}
                  />
                </td>
                <td className="w-[1%] whitespace-nowrap px-4 py-2.5">
                  <StatusPill statusId={test.remoteStatusId} vocab={vocab} muted />
                </td>
                <td className="w-[1%] whitespace-nowrap px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <span className="inline-flex w-full items-start gap-1">
                    <textarea
                      rows={commentExpanded[test.testId] ? 3 : 1}
                      value={commentValue(test)}
                      onChange={(e) =>
                        setCommentLocal((prev) => ({
                          ...prev,
                          [test.testId]: e.target.value,
                        }))
                      }
                      onFocus={() =>
                        setCommentExpanded((prev) => ({ ...prev, [test.testId]: true }))
                      }
                      onBlur={() => {
                        setCommentExpanded((prev) => ({ ...prev, [test.testId]: false }));
                        commitComment(test);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setCommentLocal((prev) => {
                            const next = { ...prev };
                            delete next[test.testId];
                            return next;
                          });
                          e.target.blur();
                        }
                      }}
                      className="w-32 resize-none rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                    {test.dirtyFields.includes('comment') && (
                      <DirtyDot title="Unsaved comment" />
                    )}
                  </span>
                </td>
              </tr>
            ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
