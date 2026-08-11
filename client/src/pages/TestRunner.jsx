import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import RunToolbar from '../components/testRunner/RunToolbar';
import TestRunTable from '../components/testRunner/TestRunTable';

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
  const requestGenRef = useRef(0);
  const abortRef = useRef(null);

  const [runInput, setRunInput] = useState('');
  const [state, setState] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [sort, setSort] = useState({ key: 'order', dir: 'asc' });
  const [query] = useState('');
  const [activeTestId, setActiveTestId] = useState(null);
  const [focusedTestId, setFocusedTestId] = useState(null);

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
      if (isCurrent()) {
        setSyncing(true);
        setError(null);
        setNotice(null);
      }
      try {
        const body = await json(`${API}/${id}/sync`, { method: 'POST', signal });
        if (!isCurrent()) return;
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
        if (!isCurrent()) return;
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
    const ctx = beginRequest();
    refreshRecent(ctx);

    if (!runIdParam) {
      if (ctx.isCurrent()) {
        setState(null);
        setLoading(false);
        setError(null);
        setNotice(null);
      }
      return invalidateRequest;
    }

    const id = Number(runIdParam);
    if (!Number.isFinite(id)) {
      if (ctx.isCurrent()) {
        setState(null);
        setError('Invalid run ID');
        setLoading(false);
      }
      return invalidateRequest;
    }

    openRun(id, ctx);

    return invalidateRequest;
  }, [runIdParam, openRun, refreshRecent, beginRequest, invalidateRequest]);

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

  const onPatch = () => {};
  const onRowClick = () => {};
  const onUpload = () => {};
  const onSync = useCallback(() => {
    const id = Number(runIdParam);
    if (!Number.isFinite(id)) return;
    syncRun(id, beginRequest());
  }, [runIdParam, beginRequest, syncRun]);

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

          {(loading || syncing) && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              {syncing ? 'Syncing from TestRail…' : 'Loading…'}
            </div>
          )}

          <TestRunTable
            tests={sortedTests}
            vocab={state.vocab}
            sort={sort}
            onSortChange={handleSortChange}
            query={query}
            activeTestId={activeTestId}
            focusedTestId={focusedTestId}
            onRowClick={onRowClick}
            onPatch={onPatch}
            readOnlyResults={state.run.isCompleted || state.run.isArchived}
          />
        </div>
      )}
    </div>
  );
}
