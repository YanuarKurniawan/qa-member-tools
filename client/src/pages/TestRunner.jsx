import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Search, X, CheckCircle2 } from 'lucide-react';
import RunToolbar from '../components/testRunner/RunToolbar';
import TestRunTable from '../components/testRunner/TestRunTable';
import CaseDrawer from '../components/testRunner/CaseDrawer';
import { statusStyle, priorityLabel, SHORTCUT_TO_STATUS } from '../components/testRunner/statusVocab';

const API = '/api/test-runs';

function isAbortError(err) {
  return err?.name === 'AbortError';
}

async function json(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (HTTP ${res.status})`);
  return body;
}

function parseRunInput(input) {
  const text = String(input || '').trim();
  const fromUrl = text.match(/\/runs\/view\/(\d+)/);
  if (fromUrl) return Number(fromUrl[1]);
  return /^\d+$/.test(text) ? Number(text) : null;
}

export default function TestRunner() {
  const { runId: runIdParam } = useParams();
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const runTokenRef = useRef(0);
  const requestGenRef = useRef(0);
  const abortRef = useRef(null);
  const mutationGenRef = useRef(0);
  const patchQueueRef = useRef(Promise.resolve());
  const pendingPatchesRef = useRef(0);

  const [runInput, setRunInput] = useState('');
  const [state, setState] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadOutcome, setUploadOutcome] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [sort, setSort] = useState({ key: 'order', dir: 'asc' });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => new Set());
  const [priorityFilter, setPriorityFilter] = useState(() => new Set());
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const searchRef = useRef(null);
  const [activeTestId, setActiveTestId] = useState(null);
  const [focusedTestId, setFocusedTestId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resetTransientFlags = useCallback(() => {
    if (!mountedRef.current) return;
    setLoading(false);
    setSyncing(false);
  }, []);

  const beginRequest = useCallback(() => {
    abortRef.current?.abort();
    requestGenRef.current += 1;
    resetTransientFlags();
    const generation = requestGenRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    const isCurrent = () => mountedRef.current && requestGenRef.current === generation;
    return { signal: controller.signal, isCurrent };
  }, [resetTransientFlags]);

  const invalidateRequest = useCallback(() => {
    abortRef.current?.abort();
    requestGenRef.current += 1;
    resetTransientFlags();
  }, [resetTransientFlags]);

  const refreshRecent = useCallback(async ({ signal, isCurrent }) => {
    try {
      const body = await json(API, { signal });
      if (!isCurrent()) return;
      setRecent(body.runs || []);
    } catch (err) {
      if (isAbortError(err)) return;
      // recent list is optional UI
    }
  }, []);

  const syncRun = useCallback(
    async (id, ctx) => {
      const { signal, isCurrent } = ctx;
      const mutationAtStart = mutationGenRef.current;
      const runToken = runTokenRef.current;
      if (isCurrent()) {
        setSyncing(true);
        setError(null);
        setNotice(null);
      }
      try {
        const body = await json(`${API}/${id}/sync`, { method: 'POST', signal });
        if (!isCurrent() || mutationGenRef.current !== mutationAtStart) return;
        if (runTokenRef.current !== runToken) return;
        const { summary, ...view } = body;
        setState(view);
        if (summary?.removedWithDrafts?.length) {
          const titles = summary.removedWithDrafts.map((item) => item.title).join(', ');
          setNotice(
            `${summary.removedWithDrafts.length} test(s) you edited are no longer in this run: ${titles}`
          );
        }
        await refreshRecent(ctx);
      } catch (err) {
        if (isAbortError(err) || !isCurrent()) return;
        setError(err.message);
      } finally {
        if (isCurrent()) setSyncing(false);
      }
    },
    [refreshRecent]
  );

  const openRun = useCallback(
    async (id, ctx) => {
      const { signal, isCurrent } = ctx;
      const mutationAtStart = mutationGenRef.current;
      const runToken = runTokenRef.current;
      if (isCurrent()) {
        setState((prev) => (prev?.run?.runId === id ? prev : null));
        setLoading(true);
        setError(null);
        setNotice(null);
      }
      try {
        const res = await fetch(`${API}/${id}`, { signal });
        const body = await res.json().catch(() => ({}));
        if (res.status === 404) {
          await syncRun(id, ctx);
          return;
        }
        if (!res.ok) throw new Error(body.error || `Request failed (HTTP ${res.status})`);
        if (!isCurrent() || mutationGenRef.current !== mutationAtStart) return;
        if (runTokenRef.current !== runToken) return;
        setState(body);
        await refreshRecent(ctx);
      } catch (err) {
        if (isAbortError(err) || !isCurrent()) return;
        setError(err.message);
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [syncRun, refreshRecent]
  );

  useEffect(() => {
    setActiveTestId(null);
    setFocusedTestId(null);
    setShowShortcuts(false);
    setUploadOutcome(null);
  }, [runIdParam]);

  useEffect(() => {
    runTokenRef.current += 1;
    const ctx = beginRequest();
    refreshRecent(ctx);

    if (!runIdParam) {
      if (ctx.isCurrent()) {
        setState(null);
        setLoading(false);
        setError(null);
        setNotice(null);
      }
      return () => {
        runTokenRef.current += 1;
        invalidateRequest();
      };
    }

    const id = Number(runIdParam);
    if (!Number.isFinite(id)) {
      if (ctx.isCurrent()) {
        setState(null);
        setError('Invalid run ID');
        setLoading(false);
      }
      return () => {
        runTokenRef.current += 1;
        invalidateRequest();
      };
    }

    openRun(id, ctx);

    return () => {
      runTokenRef.current += 1;
      invalidateRequest();
    };
  }, [runIdParam, openRun, refreshRecent, beginRequest, invalidateRequest]);

  const runId = Number(runIdParam);

  useEffect(() => {
    if (!activeTestId || !Number.isFinite(runId)) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    json(`${API}/${runId}/tests/${activeTestId}`)
      .then((body) => {
        if (!cancelled) setDetail(body);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId, activeTestId]);

  const searchNeedle = useMemo(() => query.trim().toLowerCase(), [query]);

  const sortedTests = useMemo(() => {
    if (!state?.tests) return [];
    const tests = [...state.tests];
    if (sort.key === 'order') return tests;

    const dir = sort.dir === 'asc' ? 1 : -1;
    return tests.sort((a, b) => {
      let cmp;
      if (sort.key === 'title') {
        cmp = a.title.localeCompare(b.title);
      } else {
        cmp = (a[sort.key] ?? 0) - (b[sort.key] ?? 0);
      }
      return cmp * dir;
    });
  }, [state?.tests, sort]);

  const visibleTests = useMemo(() => {
    return sortedTests.filter((test) => {
      if (searchNeedle && !test.title.toLowerCase().includes(searchNeedle)) return false;
      if (statusFilter.size > 0 && !statusFilter.has(test.statusId)) return false;
      if (priorityFilter.size > 0 && !priorityFilter.has(test.priorityId)) return false;
      if (onlyChanged && test.dirtyFields.length === 0) return false;
      if (onlyConflicts && test.conflicts.length === 0) return false;
      return true;
    });
  }, [sortedTests, searchNeedle, statusFilter, priorityFilter, onlyChanged, onlyConflicts]);

  const activeTest = useMemo(() => {
    if (!activeTestId || !state?.tests) return null;
    return state.tests.find((t) => t.testId === activeTestId) ?? null;
  }, [activeTestId, state?.tests]);

  const toggleStatusFilter = (id) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePriorityFilter = (id) => {
    setPriorityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSortChange = (key) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const id = parseRunInput(runInput);
    if (id) navigate(`/test-runner/${id}`);
  };

  const parsedId = parseRunInput(runInput);

  const onPatch = useCallback(
    (testId, patch) => {
      const id = Number(runIdParam);
      if (!Number.isFinite(id)) return;

      const runToken = runTokenRef.current;
      pendingPatchesRef.current += 1;
      setSaving(true);

      patchQueueRef.current = patchQueueRef.current
        .then(async () => {
          try {
            const next = await json(`${API}/${id}/tests/${testId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(patch),
            });
            if (runTokenRef.current !== runToken || !mountedRef.current) return;
            mutationGenRef.current += 1;
            setState(next);
            setSavedAt(Date.now());
            setError(null);
          } catch (err) {
            if (runTokenRef.current === runToken && mountedRef.current) {
              setError(err.message);
            }
          } finally {
            pendingPatchesRef.current -= 1;
            if (pendingPatchesRef.current === 0 && mountedRef.current) {
              setSaving(false);
            }
          }
        })
        .catch(() => {});
    },
    [runIdParam]
  );
  const onRowClick = useCallback((testId) => {
    setActiveTestId((prev) => {
      if (prev === testId) {
        setFocusedTestId(null);
        return null;
      }
      setFocusedTestId(testId);
      return testId;
    });
  }, []);

  const closeDrawer = useCallback(() => {
    setActiveTestId(null);
    setFocusedTestId(null);
  }, []);

  const onUpload = useCallback(async () => {
    const id = Number(runIdParam);
    if (!Number.isFinite(id)) return;

    const mutationAtStart = mutationGenRef.current;
    const runToken = runTokenRef.current;
    setUploading(true);
    setUploadOutcome(null);
    try {
      const body = await json(`${API}/${id}/upload`, { method: 'POST' });
      if (!mountedRef.current || runTokenRef.current !== runToken) return;
      if (mutationGenRef.current !== mutationAtStart) return;
      setState(body.state);
      setUploadOutcome(body.outcome);
      setError(null);
    } catch (err) {
      if (mountedRef.current && runTokenRef.current === runToken) {
        setError(err.message);
      }
    } finally {
      // Not gated on the run token: this flag disables the toolbar for whichever run is
      // showing, so an upload that resolves after navigation must still release it.
      if (mountedRef.current) setUploading(false);
    }
  }, [runIdParam]);
  const onSync = useCallback(() => {
    const id = Number(runIdParam);
    if (!Number.isFinite(id)) return;
    syncRun(id, beginRequest());
  }, [runIdParam, beginRequest, syncRun]);

  const readOnlyResults = state?.run?.isCompleted || state?.run?.isArchived;

  useEffect(() => {
    const isTyping = (target) =>
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);

    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'Escape') {
        if (isTyping(event.target)) return;
        if (document.querySelector('[aria-label="More statuses"][aria-expanded="true"]')) return;
        setActiveTestId(null);
        setShowShortcuts(false);
        return;
      }

      if (isTyping(event.target)) return;

      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (event.key === '?') {
        event.preventDefault();
        setShowShortcuts((value) => !value);
        return;
      }

      if (showShortcuts) return;

      if (visibleTests.length === 0) return;
      const index = visibleTests.findIndex((test) => test.testId === focusedTestId);

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        const next = visibleTests[Math.min(index + 1, visibleTests.length - 1)] || visibleTests[0];
        setFocusedTestId(next.testId);
        document.getElementById(`test-row-${next.testId}`)?.scrollIntoView({ block: 'nearest' });
        return;
      }

      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        const prev = visibleTests[Math.max(index - 1, 0)] || visibleTests[0];
        setFocusedTestId(prev.testId);
        document.getElementById(`test-row-${prev.testId}`)?.scrollIntoView({ block: 'nearest' });
        return;
      }

      if (event.key === 'Enter' && focusedTestId) {
        event.preventDefault();
        setActiveTestId((current) => (current === focusedTestId ? null : focusedTestId));
        return;
      }

      const statusId = SHORTCUT_TO_STATUS[event.key.toLowerCase()];
      if (statusId && focusedTestId && !readOnlyResults) {
        event.preventDefault();
        const focused = visibleTests.find((test) => test.testId === focusedTestId);
        if (focused && focused.statusId !== statusId) onPatch(focusedTestId, { statusId });
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visibleTests, focusedTestId, readOnlyResults, onPatch, showShortcuts]);

  const kbdClass =
    'rounded border border-gray-300 bg-gray-50 px-1 text-[10px] font-medium text-gray-600';

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Test Runner</h1>
      <p className="mt-1 text-sm text-gray-500">
        Execute a TestRail run without leaving one screen.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {notice && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {notice}
        </div>
      )}

      {!runIdParam && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
          <form onSubmit={handleSubmit}>
            <label htmlFor="run-input" className="block text-sm font-medium text-gray-700">
              TestRail run
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input
                id="run-input"
                type="text"
                value={runInput}
                onChange={(e) => setRunInput(e.target.value)}
                placeholder="17748 or https://tiket.testrail.com/index.php?/runs/view/17748"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={parsedId == null || loading || syncing}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Open run
              </button>
            </div>
          </form>

          {recent.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {recent.map((run) => (
                <button
                  key={run.runId}
                  type="button"
                  onClick={() => navigate(`/test-runner/${run.runId}`)}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {run.runId} · {run.runName}
                  {run.dirtyCount > 0 && (
                    <span className="text-blue-700"> · {run.dirtyCount} unsaved</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {runIdParam && loading && !state && (
        <div className="mt-8 flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      )}

      {state && (
        <div className="mt-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <RunToolbar
              run={state.run}
              counts={state.counts}
              vocab={state.vocab}
              lastSyncedAt={state.lastSyncedAt}
              dirtyCount={state.dirtyCount}
              syncing={syncing}
              uploading={uploading}
              onSync={onSync}
              onUpload={onUpload}
            />
            <p className="shrink-0 pt-5 text-xs text-gray-500" aria-live="polite">
              {saving ? 'Saving…' : savedAt ? 'Saved' : ''}
            </p>
          </div>

          {(loading || syncing) && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              {syncing ? 'Syncing from TestRail…' : 'Loading…'}
            </div>
          )}

          {readOnlyResults && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              This run is {state.run.isArchived ? 'archived' : 'completed'}, so TestRail rejects
              new results. Names and priorities can still be updated.
            </div>
          )}

          {uploadOutcome && (() => {
            const { pushed, resultsFailed, casesUpdated, casesFailed, skippedUntested, errors } =
              uploadOutcome;
            // Skipped rows are not failures, but the engineer's intent was not honored either,
            // so they must not be reported under a green "all done" banner.
            const success =
              resultsFailed === 0 && casesFailed === 0 && skippedUntested.length === 0;
            return (
              <div
                className={`relative rounded-lg border p-4 text-sm ${
                  success
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setUploadOutcome(null)}
                  aria-label="Dismiss upload summary"
                  className="absolute right-3 top-3 rounded p-0.5 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <X size={14} />
                </button>
                <div className="space-y-1 pr-6">
                  <p className="flex items-center gap-2">
                    {success && <CheckCircle2 size={16} className="shrink-0" />}
                    Uploaded {pushed} result(s) and {casesUpdated} case update(s).
                  </p>
                  {resultsFailed > 0 && <p>{resultsFailed} result(s) failed</p>}
                  {casesFailed > 0 && <p>{casesFailed} case update(s) failed</p>}
                  {skippedUntested.length > 0 && (
                    <p>
                      {skippedUntested.length} row(s) skipped because TestRail cannot set a test
                      back to Untested
                    </p>
                  )}
                  {(errors || []).slice(0, 3).map((msg) => (
                    <p key={msg} className="font-mono text-xs">
                      {msg}
                    </p>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                aria-hidden
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search test name…"
                aria-label="Search test name"
                className={`w-64 rounded-lg border border-gray-300 py-2 pl-8 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${query ? 'pr-8' : 'pr-3'}`}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {(state.vocab?.statuses || []).map((status) => {
              const selected = statusFilter.has(status.id);
              return (
                <button
                  key={status.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleStatusFilter(status.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                    selected
                      ? statusStyle(status.id).pill
                      : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {status.label}
                </button>
              );
            })}

            {(state.vocab?.priorities || []).map((priority) => {
              const selected = priorityFilter.has(priority.id);
              return (
                <button
                  key={priority.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => togglePriorityFilter(priority.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                    selected
                      ? 'border-blue-200 bg-blue-50 text-blue-800'
                      : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {priorityLabel(state.vocab, priority.id)}
                </button>
              );
            })}

            <button
              type="button"
              aria-pressed={onlyChanged}
              onClick={() => setOnlyChanged((v) => !v)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                onlyChanged
                  ? 'border-blue-200 bg-blue-50 text-blue-800'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              Only changed ({state.dirtyCount})
            </button>

            <button
              type="button"
              aria-pressed={onlyConflicts}
              onClick={() => setOnlyConflicts((v) => !v)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                onlyConflicts
                  ? 'border-blue-200 bg-blue-50 text-blue-800'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              Only conflicts ({state.conflictCount})
            </button>

            <span className="ml-auto text-xs text-gray-500" aria-live="polite">
              {visibleTests.length} of {state.tests.length} tests
            </span>
          </div>

          <p className="text-xs text-gray-500">
            <kbd className={kbdClass}>j</kbd> / <kbd className={kbdClass}>k</kbd> move ·{' '}
            <kbd className={kbdClass}>p</kbd> <kbd className={kbdClass}>f</kbd>{' '}
            <kbd className={kbdClass}>b</kbd> <kbd className={kbdClass}>r</kbd> set status ·{' '}
            <kbd className={kbdClass}>Enter</kbd> details · <kbd className={kbdClass}>/</kbd>{' '}
            search · <kbd className={kbdClass}>?</kbd> shortcuts
          </p>

          {showShortcuts && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              onClick={() => setShowShortcuts(false)}
              role="presentation"
            >
              <div
                className="w-80 rounded-xl border border-gray-200 bg-white p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-labelledby="shortcuts-title"
              >
                <h2 id="shortcuts-title" className="text-sm font-semibold text-gray-900">
                  Keyboard shortcuts
                </h2>
                <dl className="mt-4 space-y-2 text-sm">
                  {[
                    ['Move down', 'j / ↓'],
                    ['Move up', 'k / ↑'],
                    ['Set Passed', 'p'],
                    ['Set Failed', 'f'],
                    ['Set Blocked', 'b'],
                    ['Set Retest', 'r'],
                    ['Open / close details', 'Enter'],
                    ['Focus search', '/'],
                    ['Show shortcuts', '?'],
                    ['Close drawer / overlay', 'Esc'],
                  ].map(([label, keys]) => (
                    <div key={label} className="flex items-center justify-between gap-4">
                      <dt className="text-gray-600">{label}</dt>
                      <dd>
                        <kbd className={kbdClass}>{keys}</kbd>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}

          {state.conflictCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <span>
                {state.conflictCount} row(s) changed in TestRail while you were editing.
              </span>
              <button
                type="button"
                onClick={() => setOnlyConflicts(true)}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Show only conflicts
              </button>
            </div>
          )}

          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              <TestRunTable
                tests={visibleTests}
                vocab={state.vocab}
                sort={sort}
                onSortChange={handleSortChange}
                searchNeedle={searchNeedle}
                activeTestId={activeTestId}
                focusedTestId={focusedTestId}
                onRowClick={onRowClick}
                onPatch={onPatch}
                readOnlyResults={readOnlyResults}
              />
            </div>
            {activeTest && (
              <CaseDrawer
                test={activeTest}
                vocab={state.vocab}
                detail={detail}
                loading={detailLoading}
                disabled={state.run.isCompleted || state.run.isArchived}
                onClose={closeDrawer}
                onPatch={onPatch}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
