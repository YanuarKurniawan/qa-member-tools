import { useState, useEffect } from 'react';
import {
  Sheet,
  TicketCheck,
  FlaskConical,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Link2,
} from 'lucide-react';

const SOURCE_META = {
  googleSheet: { icon: Sheet, accent: 'text-emerald-600', bar: 'bg-emerald-500', platform: 'Google Sheets' },
  jira: { icon: TicketCheck, accent: 'text-blue-600', bar: 'bg-blue-500', platform: 'Jira' },
  testrail: { icon: FlaskConical, accent: 'text-violet-600', bar: 'bg-violet-500', platform: 'TestRail' },
};

const ORDER = ['googleSheet', 'jira', 'testrail'];

function formatAbsolute(iso) {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelative(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

export default function AutomationWeb() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  // null when idle; otherwise 'all' or a single source key that is refreshing.
  const [refreshing, setRefreshing] = useState(null);
  const [refreshError, setRefreshError] = useState(null);

  useEffect(() => {
    fetch('/api/automation-web')
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        return body;
      })
      .then((body) => {
        setData(body);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // only = null refreshes every source; a source key refreshes just that one.
  const refresh = async (only = null) => {
    setRefreshing(only || 'all');
    setRefreshError(null);
    try {
      const res = await fetch('/api/automation-web/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(only ? { only } : {}),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setData(body);
      setError(null);
    } catch (err) {
      setRefreshError(err.message);
    } finally {
      setRefreshing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader
          lastUpdated={null}
          onRefresh={() => refresh()}
          refreshing={refreshing === 'all'}
          busy={refreshing !== null}
        />
        {refreshError && <RefreshErrorBanner message={refreshError} />}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">No data snapshot yet.</p>
              <p className="mt-1 text-amber-700">{error}</p>
              <p className="mt-2 text-amber-900">
                Click <span className="font-medium">Refresh</span> to pull data now, or run{' '}
                <span className="font-mono text-xs">node scripts/refreshAutomationWeb.js</span>.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { sources, reconciliation } = data;
  const match = reconciliation?.allMatch;
  const jira = sources.jira || {};
  const jiraNotLive = jira.source && !['jira-api'].includes(jira.source);

  return (
    <div>
      <PageHeader
        lastUpdated={data.lastUpdated}
        platform={data.platform}
        onRefresh={() => refresh()}
        refreshing={refreshing === 'all'}
        busy={refreshing !== null}
      />

      {refreshError && <RefreshErrorBanner message={refreshError} />}

      {jiraNotLive && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-800">
          Jira isn't refreshed live from the browser (no{' '}
          <span className="font-mono">JIRA_API_TOKEN</span> configured) — its value is carried over
          from the last CLI/agent update. Sheets and TestRail refresh live.
        </div>
      )}

      {/* Reconciliation status */}
      <div
        className={`mb-8 rounded-xl border p-5 ${
          match
            ? 'border-green-200 bg-green-50'
            : 'border-amber-200 bg-amber-50'
        }`}
      >
        <div className="flex items-center gap-3">
          {match ? (
            <CheckCircle2 size={22} className="shrink-0 text-green-600" />
          ) : (
            <AlertTriangle size={22} className="shrink-0 text-amber-600" />
          )}
          <div>
            <h2 className={`text-lg font-semibold ${match ? 'text-green-800' : 'text-amber-900'}`}>
              {match ? 'All three sources match' : 'Sources do not match'}
            </h2>
            <p className={`text-sm ${match ? 'text-green-700' : 'text-amber-800'}`}>
              {match
                ? `Every source reports ${reconciliation.max} WEB automation cases.`
                : `Spread of ${reconciliation.spread} between the highest (${reconciliation.max}) and lowest (${reconciliation.min}).`}
            </p>
          </div>
        </div>

        {/* Comparison bars */}
        <div className="mt-5 space-y-3">
          {ORDER.map((key) => {
            const src = sources[key];
            if (!src) return null;
            const meta = SOURCE_META[key];
            const pct = reconciliation.max ? Math.round(((src.count ?? 0) / reconciliation.max) * 100) : 0;
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-xs font-medium text-gray-600">
                  {src.url ? (
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-blue-600 hover:underline"
                    >
                      {shortLabel(key)}
                      <ArrowUpRight size={11} className="opacity-60" />
                    </a>
                  ) : (
                    shortLabel(key)
                  )}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/70">
                  <div
                    className={`h-full rounded-full ${meta.bar} transition-all`}
                    style={{ width: `${src.count == null ? 0 : Math.max(pct, 2)}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-gray-900">
                  {src.count ?? '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Source cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ORDER.map((key) => (
          <SourceCard
            key={key}
            sourceKey={key}
            source={sources[key]}
            onRefresh={() => refresh(key)}
            refreshing={refreshing === key}
            busy={refreshing !== null}
          />
        ))}
      </div>

      <BreakdownTabs sources={sources} connections={data.connections} />

      <p className="mt-8 text-xs text-gray-400">
        Snapshot data. Refresh with the <span className="font-mono">/update-automation-web</span> command
        or <span className="font-mono">node scripts/refreshAutomationWeb.js</span>.
      </p>
    </div>
  );
}

function shortLabel(key) {
  return { googleSheet: 'Google Sheet', jira: 'Jira (Done)', testrail: 'TestRail (Yes + Done)' }[key];
}

function PageHeader({ lastUpdated, platform, onRefresh, refreshing, busy }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Automation WEB</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 shadow-sm">
            <Clock size={13} className="text-gray-400" />
            <span className="font-medium text-gray-700">Last Data Update:</span>
            <span>{formatAbsolute(lastUpdated)}</span>
            {lastUpdated && <span className="text-gray-400">({formatRelative(lastUpdated)})</span>}
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={busy}
              title="Refresh all sources"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh all'}
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Reconciles WEB automation coverage across Google Sheet, Jira, and TestRail
        {platform ? ` — ${platform}` : ''}.
      </p>
      {busy && (
        <p className="mt-1 text-xs text-gray-400">
          Pulling live data — this can take ~15s.
        </p>
      )}
    </div>
  );
}

function RefreshErrorBanner({ message }) {
  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
      <div className="flex items-start gap-2">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        <span>Refresh failed: {message}</span>
      </div>
    </div>
  );
}

function SourceCard({ sourceKey, source, onRefresh, refreshing, busy }) {
  if (!source) return null;
  const meta = SOURCE_META[sourceKey];
  const Icon = meta.icon;
  const stale = source.stale;
  const platform = meta.platform;

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-blue-200 hover:shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 ${meta.accent}`}>
          <Icon size={20} />
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            aria-label={`Refresh ${platform}`}
            title={`Refresh ${platform}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition-colors hover:border-blue-200 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        )}
      </div>
      <h3 className="text-sm font-medium text-gray-500">{source.label}</h3>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tabular-nums text-gray-900">
          {source.count ?? '—'}
        </span>
        {source.total != null && (
          <span className="text-sm text-gray-400">/ {source.total}</span>
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gray-500">{source.detail}</p>
      {stale && (
        <p className="mt-2 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
          <AlertTriangle size={11} /> stale — not refreshed
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
          >
            Open in {platform}
            <ArrowUpRight size={13} />
          </a>
        ) : (
          <span />
        )}
        {source.fetchedAt && (
          <span className="text-[11px] text-gray-400" title={formatAbsolute(source.fetchedAt)}>
            {formatRelative(source.fetchedAt)}
          </span>
        )}
      </div>
    </div>
  );
}

function LinkCell({ href, label, fallback }) {
  if (!href) return <span className="text-gray-300">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 hover:underline"
    >
      {label || fallback}
      <ArrowUpRight size={12} className="opacity-0 transition-opacity group-hover:opacity-70" />
    </a>
  );
}

function ShouldRunChip({ value, run }) {
  if (run) {
    return (
      <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
        y
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
      {value || 'n'}
    </span>
  );
}

function PriorityChip({ value }) {
  if (!value) return <span className="text-gray-300">—</span>;
  const v = value.toUpperCase();
  const cls =
    v === 'P0'
      ? 'bg-red-50 text-red-700'
      : v === 'P1'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{value}</span>
  );
}

function BreakdownTabs({ sources, connections }) {
  const tabs = [
    {
      key: 'connection',
      label: 'Connection',
      icon: Link2,
      accent: 'text-indigo-600',
      count: connections?.rows?.length ?? 0,
      render: () => <ConnectionBreakdown connections={connections || {}} />,
    },
    {
      key: 'googleSheet',
      label: 'Sheet breakdown',
      icon: SOURCE_META.googleSheet.icon,
      accent: SOURCE_META.googleSheet.accent,
      count: sources.googleSheet?.rows?.length ?? 0,
      render: () => <GoogleSheetBreakdown sheet={sources.googleSheet || {}} />,
    },
    {
      key: 'jira',
      label: 'Jira breakdown',
      icon: SOURCE_META.jira.icon,
      accent: SOURCE_META.jira.accent,
      count: sources.jira?.rows?.length ?? 0,
      render: () => <JiraBreakdown jira={sources.jira || {}} />,
    },
    {
      key: 'testrail',
      label: 'TestRail breakdown',
      icon: SOURCE_META.testrail.icon,
      accent: SOURCE_META.testrail.accent,
      count: sources.testrail?.cases?.length ?? 0,
      render: () => <TestrailBreakdown testrail={sources.testrail || {}} />,
    },
  ];

  const [active, setActive] = useState(tabs.find((t) => t.count > 0)?.key || tabs[0].key);
  const current = tabs.find((t) => t.key === active) || tabs[0];

  if (tabs.every((t) => t.count === 0)) return null;

  return (
    <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-gray-200 px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={tab.count === 0}
              onClick={() => setActive(tab.key)}
              className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:text-gray-300 ${
                isActive
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Icon size={15} className={isActive ? tab.accent : 'opacity-70'} />
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="p-5">{current.render()}</div>
    </div>
  );
}

function BreakdownHeader({ title, subtitle, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function OpenLink({ href, children }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
    >
      {children}
      <ArrowUpRight size={13} />
    </a>
  );
}

const SYNC_CLS = {
  ok: 'bg-green-50 text-green-700 ring-green-600/20',
  warn: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  missing: 'bg-red-50 text-red-700 ring-red-600/20',
};

function SyncPill({ label, state }) {
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
        SYNC_CLS[state] || SYNC_CLS.missing
      }`}
    >
      {label}
    </span>
  );
}

function ConnectionBreakdown({ connections }) {
  const rows = connections.rows || [];

  if (rows.length === 0) {
    return <EmptyPanel>Nothing to connect yet. Refresh the sources to build the join.</EmptyPanel>;
  }

  const synced = connections.synced ?? rows.filter((r) => r.synced).length;
  const attention = rows.length - synced;

  return (
    <div>
      <BreakdownHeader
        title="Connection — Sheet ↔ Jira ↔ TestRail"
        subtitle="Joined on the Google Sheet's Jira ID and TestRail ID — it is the only source carrying both."
      >
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset bg-green-50 text-green-700 ring-green-600/20">
            Synced <span className="tabular-nums">{synced}</span>
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
              attention ? 'bg-amber-50 text-amber-800 ring-amber-600/20' : NEUTRAL_CHIP
            }`}
          >
            Needs attention <span className="tabular-nums">{attention}</span>
          </span>
        </div>
      </BreakdownHeader>

      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2">Jira ID</th>
              <th className="px-4 py-2">TestRail ID</th>
              <th className="px-4 py-2">Test Name</th>
              <th className="px-4 py-2">Synced</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const notes = [...r.sheet.notes, ...r.jira.notes, ...r.testrail.notes];
              return (
                <tr
                  key={r.id}
                  className={`border-b border-gray-100 align-top transition-colors last:border-0 hover:bg-gray-50 ${
                    r.synced ? '' : 'bg-amber-50/30'
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {r.jiraKey ? (
                      <LinkCell href={r.jiraUrl} label={r.jiraKey} fallback="Jira" />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {r.testrailId ? (
                      <LinkCell href={r.testrailUrl} label={r.testrailId} fallback="TestRail" />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="max-w-[320px] px-4 py-2.5 font-medium text-gray-800 [overflow-wrap:anywhere]">
                    {r.testName}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <SyncPill label="Sheet" state={r.sheet.state} />
                      <SyncPill label="Jira" state={r.jira.state} />
                      <SyncPill label="TestRail" state={r.testrail.state} />
                    </div>
                    {notes.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-[11px] leading-snug text-gray-500">
                        {notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyPanel({ children }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
      {children}
    </div>
  );
}

function GoogleSheetBreakdown({ sheet }) {
  const rows = sheet.rows || [];
  const runCount = rows.filter((r) => r.run).length;
  const platform = sheet.meta?.platform || 'dweb';

  if (rows.length === 0) {
    return <EmptyPanel>No sheet rows in this snapshot. Refresh the Google Sheet source to pull them.</EmptyPanel>;
  }

  return (
    <div>
      <BreakdownHeader
        title={`Google Sheet breakdown — ${platform}`}
        subtitle={`${runCount} of ${rows.length} ${platform} rows have ShouldRun = y`}
      >
        <OpenLink href={sheet.url}>Open sheet</OpenLink>
      </BreakdownHeader>

      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Platform</th>
              <th className="px-4 py-2 text-center">ShouldRun</th>
              <th className="px-4 py-2">Jira Link</th>
              <th className="px-4 py-2">TestRail Link</th>
              <th className="px-4 py-2 text-center">Priority</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.title}-${i}`}
                className="border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50"
              >
                <td className="max-w-[260px] px-4 py-2 font-medium text-gray-800 [overflow-wrap:anywhere]">
                  {r.title || '—'}
                </td>
                <td className="px-4 py-2 text-gray-500">{r.platform}</td>
                <td className="px-4 py-2 text-center">
                  <ShouldRunChip value={r.shouldRun} run={r.run} />
                </td>
                <td className="px-4 py-2">
                  <LinkCell href={r.jiraUrl} label={r.jiraKey} fallback="Jira" />
                </td>
                <td className="px-4 py-2">
                  <LinkCell href={r.testrailUrl} label={r.testrailId} fallback="TestRail" />
                </td>
                <td className="px-4 py-2 text-center">
                  <PriorityChip value={r.priority} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusChip({ status, category, done }) {
  if (!status) return <span className="text-gray-300">—</span>;
  const cls = done
    ? 'bg-green-50 text-green-700 ring-green-600/20'
    : category === 'indeterminate'
      ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
      : category === 'new'
        ? 'bg-blue-50 text-blue-700 ring-blue-600/20'
        : 'bg-gray-100 text-gray-500 ring-gray-400/20';
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}
    >
      {status}
    </span>
  );
}

function LabelChips({ labels }) {
  if (!labels?.length) return <span className="text-gray-300">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <span
          key={l}
          className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600"
        >
          {l}
        </span>
      ))}
    </div>
  );
}

function PersonCell({ name }) {
  if (!name) return <span className="text-gray-300">Unassigned</span>;
  return <span className="text-gray-700">{name}</span>;
}

function JiraBreakdown({ jira }) {
  const rows = jira.rows || [];
  const doneCount = rows.filter((r) => r.done).length;
  const epicKey = jira.meta?.epicKey || 'epic';
  const scope = [jira.meta?.storyType, jira.meta?.label].filter(Boolean).join(' · ');

  if (rows.length === 0) {
    return <EmptyPanel>No Jira issues in this snapshot. Refresh the Jira source to pull them.</EmptyPanel>;
  }

  return (
    <div>
      <BreakdownHeader
        title={`Jira breakdown — ${epicKey}${scope ? ` · ${scope}` : ''}`}
        subtitle={`${doneCount} of ${rows.length} issues are Done`}
      >
        <OpenLink href={jira.scopeUrl || jira.url}>Open in Jira</OpenLink>
      </BreakdownHeader>

      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2">Jira ID</th>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Labels</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Assignee</th>
              <th className="px-4 py-2">QA Assignee</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.key}
                className="border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50"
              >
                <td className="whitespace-nowrap px-4 py-2">
                  <LinkCell href={r.url} label={r.key} fallback="Jira" />
                </td>
                <td className="max-w-[320px] px-4 py-2 font-medium text-gray-800 [overflow-wrap:anywhere]">
                  {r.title || '—'}
                </td>
                <td className="max-w-[180px] px-4 py-2">
                  <LabelChips labels={r.labels} />
                </td>
                <td className="px-4 py-2">
                  <StatusChip status={r.status} category={r.statusCategory} done={r.done} />
                </td>
                <td className="px-4 py-2">
                  <PersonCell name={r.assignee} />
                </td>
                <td className="px-4 py-2">
                  <PersonCell name={r.qaAssignee} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const NEUTRAL_CHIP = 'bg-gray-100 text-gray-500 ring-gray-400/20';
const TR_TYPE_CLS = {
  Yes: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  TBR: 'bg-amber-50 text-amber-700 ring-amber-600/20',
};
const TR_STATUS_CLS = {
  Done: 'bg-green-50 text-green-700 ring-green-600/20',
  'In Progress': 'bg-amber-50 text-amber-700 ring-amber-600/20',
  Blocked: 'bg-red-50 text-red-700 ring-red-600/20',
  'Do Again': 'bg-red-50 text-red-700 ring-red-600/20',
};

function Chip({ label, cls }) {
  if (!label) return <span className="text-gray-300">—</span>;
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls || NEUTRAL_CHIP}`}
    >
      {label}
    </span>
  );
}

function CountChips({ counts, classes }) {
  const entries = Object.entries(counts || {});
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([label, value]) => (
        <span
          key={label}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
            classes[label] || NEUTRAL_CHIP
          }`}
        >
          {label}
          <span className="tabular-nums">{value}</span>
        </span>
      ))}
    </div>
  );
}

function RefCell({ refs }) {
  if (!refs?.length) return <span className="text-gray-300">—</span>;
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1">
      {refs.map((r) =>
        r.url ? (
          <LinkCell key={r.key} href={r.url} label={r.key} />
        ) : (
          <span key={r.key} className="text-gray-600">
            {r.key}
          </span>
        )
      )}
    </div>
  );
}

function TestrailBreakdown({ testrail }) {
  const cases = testrail.cases || [];
  const bd = testrail.breakdown || {};

  if (cases.length === 0) {
    return <EmptyPanel>No TestRail cases in this snapshot. Refresh the TestRail source to pull them.</EmptyPanel>;
  }

  return (
    <div>
      <BreakdownHeader
        title={`TestRail breakdown — ${testrail.meta?.sectionName || 'Platform-Eiffel'}${
          testrail.meta?.sectionLabel ? ` · ${testrail.meta.sectionLabel}` : ''
        }`}
        subtitle={`${testrail.count ?? '—'} of ${cases.length} cases are Automation Type = Yes and Status = Done`}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <CountChips counts={bd.type} classes={TR_TYPE_CLS} />
          <span className="h-4 w-px bg-gray-200" />
          <CountChips counts={bd.status} classes={TR_STATUS_CLS} />
        </div>
      </BreakdownHeader>

      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2">Case ID</th>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Folder</th>
              <th className="px-4 py-2 text-center">Label</th>
              <th className="px-4 py-2">Automation Type</th>
              <th className="px-4 py-2">Automation Status</th>
              <th className="px-4 py-2">Reference</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr
                key={c.id}
                className="border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50"
              >
                <td className="whitespace-nowrap px-4 py-2">
                  <LinkCell href={c.url} label={c.id} fallback="TestRail" />
                </td>
                <td className="max-w-[360px] px-4 py-2 font-medium text-gray-800 [overflow-wrap:anywhere]">
                  {c.title || '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-gray-500">{c.folder}</td>
                <td className="whitespace-nowrap px-4 py-2 text-center">
                  <PriorityChip value={c.label} />
                </td>
                <td className="px-4 py-2">
                  <Chip label={c.automationType} cls={TR_TYPE_CLS[c.automationType]} />
                </td>
                <td className="px-4 py-2">
                  <Chip label={c.automationStatus} cls={TR_STATUS_CLS[c.automationStatus]} />
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <RefCell refs={c.refs} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
