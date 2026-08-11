/**
 * Automation WEB reconciliation — shared fetch logic.
 *
 * Pulls three counts that should line up for WEB (dWeb / Eiffel) automation and
 * builds a snapshot written to server/data/automationWeb.json:
 *
 *   1. Google Sheet — rows where ShouldRun = "y"          (service-account JWT)
 *   2. Jira         — child issues of an epic in "Done"    (API token OR passed-in counts)
 *   3. TestRail     — cases with Automation Type = "Yes"   (API key, bulk get_cases)
 *
 * Used by both the CLI (scripts/refreshAutomationWeb.js) and the server refresh
 * endpoint (POST /api/automation-web/refresh).
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Ensures .env is loaded (config requires dotenv).
require('./config');

// ─── Definitions (override via env if the setup ever moves) ─────────────
const DEFS = {
  sheet: {
    spreadsheetId: process.env.AUTOMATION_WEB_SHEET_ID || '1awvp3vH5N9BhFDlVmVj0dJQ-cB9S3Rh7QaYF-4RmpQk',
    tab: process.env.AUTOMATION_WEB_SHEET_TAB || 'Sheet1',
    headerName: 'ShouldRun',
    matchValue: 'y',
    // Only rows for this platform are counted / listed (case-insensitive; "dWeb" == "dweb").
    platformValue: process.env.AUTOMATION_WEB_SHEET_PLATFORM || 'dweb',
  },
  jira: {
    baseUrl: process.env.JIRA_BASE_URL || 'https://borobudur.atlassian.net',
    epicKey: process.env.AUTOMATION_WEB_JIRA_EPIC || 'QAAUT-30177',
    doneStatus: 'Done',
    // Children are narrowed by "Story Type" and by label; set either env var to an
    // empty string to drop that part of the filter.
    storyType: process.env.AUTOMATION_WEB_JIRA_STORY_TYPE ?? 'New Feature',
    label: process.env.AUTOMATION_WEB_JIRA_LABEL ?? 'P0',
    // Abandoned work never gets automated, so it is dropped from both the count
    // denominator and the breakdown. Comma-separated; empty keeps every status.
    excludeStatuses: (process.env.AUTOMATION_WEB_JIRA_EXCLUDE_STATUSES ?? 'Invalid,Dropped')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    fields: {
      storyType: 'customfield_10904',
      qaAssignee: 'customfield_10796',
    },
  },
  testrail: {
    baseUrl: (process.env.TESTRAIL_BASE_URL || 'https://tiket.testrail.com').replace(/\/$/, ''),
    projectId: Number(process.env.AUTOMATION_WEB_TR_PROJECT || 162),
    suiteId: Number(process.env.AUTOMATION_WEB_TR_SUITE || 4844),
    sectionName: process.env.AUTOMATION_WEB_TR_SECTION || 'Platform-Eiffel',
    // Sections nest as "<root> / <folder> / <label>"; only cases under this label
    // are in scope. Set to an empty string to include every label.
    sectionLabel: process.env.AUTOMATION_WEB_TR_LABEL ?? 'P0',
    // Option id → label maps come from get_case_fields; a case counts only when
    // both fields sit on the "automated and finished" option.
    automationTypeField: 'custom_automation_type',
    automationTypeLabels: { 1: 'No', 2: 'Yes', 3: 'TBR' },
    yesValue: 2,
    automationStatusField: 'custom_automation_status',
    automationStatusLabels: {
      1: 'Done',
      2: 'Not yet',
      3: 'In Progress',
      4: 'Blocked',
      5: 'Deferred',
      6: 'Less ROI in Automation',
      7: 'Do Again',
    },
    doneValue: 1,
  },
};

const OUTPUT_FILE = path.resolve(__dirname, '../../server/data/automationWeb.json');

// ─── Small helpers ──────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jsonFetch(url, options, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      let body;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (!res.ok) {
        const detail = typeof body === 'string' ? body : JSON.stringify(body);
        throw new Error(`HTTP ${res.status} for ${url.split('?')[0]}: ${String(detail).slice(0, 300)}`);
      }
      return body;
    } catch (err) {
      lastErr = err;
      // Retry only transient network errors, not HTTP 4xx/5xx responses.
      if (attempt < retries && /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|socket/i.test(err.message)) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr;
}

// ─── Google Sheets (service account JWT) ────────────────────────────────
function loadServiceAccount() {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (inline && inline.trim().startsWith('{')) return JSON.parse(inline);
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  throw new Error('No Google credentials: set GOOGLE_SERVICE_ACCOUNT_FILE or GOOGLE_SERVICE_ACCOUNT_KEY in .env');
}

async function getGoogleAccessToken(sa, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope,
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const signingInput = `${enc(header)}.${enc(claim)}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(sa.private_key).toString('base64url');
  const assertion = `${signingInput}.${signature}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const tokenRes = await jsonFetch(claim.aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!tokenRes.access_token) throw new Error('Google token exchange failed');
  return tokenRes.access_token;
}

function normHeader(s) {
  return String(s == null ? '' : s).trim().toLowerCase();
}

// The sheet header is messy (duplicate "Jira Link" / "text" columns), so the
// clickable URL columns are found by scanning cell contents, not by header name.
function detectUrlColumn(rows, startRow, test) {
  const counts = {};
  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] == null ? '' : row[c]).trim();
      if (/^https?:\/\//i.test(v) && test(v)) counts[c] = (counts[c] || 0) + 1;
    }
  }
  let best = -1;
  let bestN = 0;
  for (const [c, n] of Object.entries(counts)) {
    if (n > bestN) {
      bestN = n;
      best = Number(c);
    }
  }
  return best;
}

async function fetchSheetCount() {
  const { spreadsheetId, tab, headerName, matchValue, platformValue } = DEFS.sheet;
  const sa = loadServiceAccount();
  const token = await getGoogleAccessToken(sa, 'https://www.googleapis.com/auth/spreadsheets.readonly');
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values`;

  // Pull the whole tab once, then resolve columns and filter to the platform.
  const data = await jsonFetch(`${base}/${encodeURIComponent(tab)}`, auth);
  const rows = data.values || [];
  if (rows.length === 0) throw new Error(`No data in tab "${tab}"`);

  const header = rows[0].map(normHeader);
  const titleCol = header.indexOf('title');
  const platformCol = header.indexOf('platform');
  const shouldRunCol = header.indexOf(headerName.toLowerCase());
  const priorityCol = header.indexOf('priority');
  if (platformCol === -1) throw new Error(`Column "Platform" not found in ${tab} header`);
  if (shouldRunCol === -1) throw new Error(`Column "${headerName}" not found in ${tab} header`);

  // The sheet has MULTIPLE link columns per system ("Jira Link" x2, "url testrail"
  // + "Testrail Link"), and which one is filled varies row to row. So gather every
  // candidate column (by header, plus a content-detected fallback) and scan them
  // all per row instead of trusting a single column.
  const headerCols = (substr) => header.reduce((a, h, i) => (h.includes(substr) ? [...a, i] : a), []);
  const uniq = (arr) => [...new Set(arr.filter((i) => i >= 0))];
  const jiraCols = uniq([...headerCols('jira'), detectUrlColumn(rows, 1, (v) => /atlassian\.net/i.test(v))]);
  const testrailCols = uniq([...headerCols('testrail'), detectUrlColumn(rows, 1, (v) => /testrail\.com/i.test(v))]);

  const cell = (row, i) => (i >= 0 && row[i] != null ? String(row[i]).trim() : '');

  // Cells are inconsistent: some hold a raw URL, others a HYPERLINK whose display
  // text is just the key/case-id (the values API hides the real URL). Prefer a real
  // URL across the candidate columns; otherwise rebuild from a bare key/id.
  const jiraBase = DEFS.jira.baseUrl.replace(/\/$/, '');
  const trBase = DEFS.testrail.baseUrl.replace(/\/$/, '');
  const resolveJira = (row) => {
    for (const c of jiraCols) {
      const v = cell(row, c);
      if (/atlassian\.net\/browse\//i.test(v)) {
        return { url: v, key: (v.match(/\/browse\/([A-Za-z]+-\d+)/i) || [])[1] || '' };
      }
    }
    for (const c of jiraCols) {
      const v = cell(row, c);
      if (/^[A-Za-z]+-\d+$/.test(v)) return { url: `${jiraBase}/browse/${v}`, key: v };
    }
    return { url: null, key: '' };
  };
  const resolveTestrail = (row) => {
    for (const c of testrailCols) {
      const v = cell(row, c);
      if (/testrail\.com/i.test(v)) {
        return { url: v, id: (v.match(/\/cases\/view\/(\d+)/i) || [])[1] || '' };
      }
    }
    for (const c of testrailCols) {
      const v = cell(row, c);
      if (/^\d{4,}$/.test(v)) return { url: `${trBase}/index.php?/cases/view/${v}`, id: v };
    }
    return { url: null, id: '' };
  };

  const platformNorm = platformValue.toLowerCase();
  const list = [];
  let platformTotal = 0;
  let count = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const platform = cell(row, platformCol);
    if (platform.toLowerCase() !== platformNorm) continue;
    platformTotal++;

    const shouldRun = cell(row, shouldRunCol);
    const run = shouldRun.toLowerCase() === matchValue.toLowerCase();
    if (run) count++;

    const jira = resolveJira(row);
    const testrail = resolveTestrail(row);
    list.push({
      title: cell(row, titleCol),
      platform,
      shouldRun,
      run,
      priority: cell(row, priorityCol),
      jiraUrl: jira.url,
      jiraKey: jira.key,
      testrailUrl: testrail.url,
      testrailId: testrail.id,
    });
  }

  // ShouldRun = y first, then alphabetical by title.
  list.sort((a, b) => (a.run === b.run ? a.title.localeCompare(b.title) : a.run ? -1 : 1));

  return {
    label: `Google Sheet — ShouldRun: y (${platformValue})`,
    count,
    total: platformTotal,
    detail: `Rows with Platform = "${platformValue}" and ${headerName} = "${matchValue}" (of ${platformTotal} ${platformValue} rows)`,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`,
    rows: list,
    meta: { spreadsheetId, tab, platform: platformValue },
  };
}

// ─── TestRail (API key; native get_cases returns custom fields) ──────────
function testrailAuth() {
  const user = process.env.TESTRAIL_USER;
  const key = process.env.TESTRAIL_API_KEY || process.env.TESTRAIL_PASS;
  if (!user || !key) throw new Error('TestRail credentials missing (TESTRAIL_USER / TESTRAIL_API_KEY)');
  return 'Basic ' + Buffer.from(`${user}:${key}`).toString('base64');
}

async function trGet(endpoint) {
  const auth = testrailAuth();
  return jsonFetch(`${DEFS.testrail.baseUrl}/index.php?/api/v2/${endpoint}`, {
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
  });
}

async function getAllSections(projectId, suiteId) {
  let offset = 0;
  const limit = 250;
  const all = [];
  for (;;) {
    const data = await trGet(`get_sections/${projectId}&suite_id=${suiteId}&limit=${limit}&offset=${offset}`);
    const batch = Array.isArray(data) ? data : data.sections || [];
    all.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return all;
}

async function getCasesForSection(projectId, suiteId, sectionId) {
  let offset = 0;
  const limit = 250;
  const all = [];
  for (;;) {
    const data = await trGet(
      `get_cases/${projectId}&suite_id=${suiteId}&section_id=${sectionId}&limit=${limit}&offset=${offset}`
    );
    const batch = Array.isArray(data) ? data : data.cases || [];
    all.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return all;
}

function collectSubtreeIds(sections, rootId) {
  const childrenOf = new Map();
  for (const s of sections) {
    const p = s.parent_id;
    if (!childrenOf.has(p)) childrenOf.set(p, []);
    childrenOf.get(p).push(s);
  }
  const ids = [];
  const walk = (id) => {
    ids.push(id);
    for (const child of childrenOf.get(id) || []) walk(child.id);
  };
  walk(rootId);
  return ids;
}

async function fetchTestrailCount() {
  const {
    projectId,
    suiteId,
    sectionName,
    sectionLabel,
    automationTypeField,
    automationTypeLabels,
    yesValue,
    automationStatusField,
    automationStatusLabels,
    doneValue,
  } = DEFS.testrail;
  const sections = await getAllSections(projectId, suiteId);
  const root = sections.find((s) => String(s.name).trim() === sectionName && s.parent_id == null);
  if (!root) throw new Error(`Section "${sectionName}" not found in suite ${suiteId}`);

  const subtreeIds = collectSubtreeIds(sections, root.id);
  const sectionById = new Map(sections.map((s) => [s.id, s]));

  // Sections nest as "<root> / <folder> / <label>", e.g. Platform-Eiffel / Membership / P0.
  const pathParts = (id) => {
    const parts = [];
    let cur = sectionById.get(id);
    while (cur && cur.id !== root.id) {
      parts.unshift(cur.name);
      cur = cur.parent_id != null ? sectionById.get(cur.parent_id) : null;
    }
    return parts;
  };
  // Sorting follows the subtree walk so folders and labels keep TestRail's own order.
  const sectionOrder = new Map(subtreeIds.map((id, i) => [id, i]));
  // Skipping out-of-scope sections up front also avoids fetching their cases.
  const scopedIds = sectionLabel
    ? subtreeIds.filter((id) => pathParts(id)[1] === sectionLabel)
    : subtreeIds;
  if (scopedIds.length === 0) {
    throw new Error(`No "${sectionLabel}" sub-sections found under "${sectionName}"`);
  }

  // The TestRail "References" field holds Jira keys, so link them back to Jira.
  const jiraBase = DEFS.jira.baseUrl.replace(/\/$/, '');
  const parseRefs = (raw) =>
    String(raw || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((ref) => ({
        key: ref,
        url: /^https?:\/\//i.test(ref)
          ? ref
          : /^[A-Za-z]+-\d+$/.test(ref)
            ? `${jiraBase}/browse/${ref}`
            : null,
      }));

  const breakdown = { type: {}, status: {} };
  const list = [];
  let count = 0;

  // Sequential — TestRail is unhappy with many concurrent connections.
  for (const id of scopedIds) {
    const cases = await getCasesForSection(projectId, suiteId, id);
    for (const c of cases) {
      const typeId = c[automationTypeField];
      const statusId = c[automationStatusField];
      const automationType = automationTypeLabels[typeId] || 'Unset';
      const automationStatus = automationStatusLabels[statusId] || 'Unset';
      breakdown.type[automationType] = (breakdown.type[automationType] || 0) + 1;
      breakdown.status[automationStatus] = (breakdown.status[automationStatus] || 0) + 1;

      const counted = typeId === yesValue && statusId === doneValue;
      if (counted) count++;
      const sectionId = c.section_id != null ? c.section_id : id;
      const parts = pathParts(sectionId);
      list.push({
        id: c.id,
        title: c.title || '',
        folder: parts[0] || root.name,
        label: parts.slice(1).join(' / '),
        sectionId,
        url: `${DEFS.testrail.baseUrl}/index.php?/cases/view/${c.id}`,
        automationType,
        automationStatus,
        refs: parseRefs(c.refs),
        counted,
      });
    }
  }

  // Grouped by folder then label (TestRail order), automated ones first inside each.
  list.sort(
    (a, b) =>
      (sectionOrder.get(a.sectionId) ?? 0) - (sectionOrder.get(b.sectionId) ?? 0) ||
      Number(b.counted) - Number(a.counted) ||
      a.id - b.id
  );

  const scopeName = `"${sectionName}"${sectionLabel ? ` ${sectionLabel}` : ''}`;
  return {
    label: 'TestRail — Automation Yes + Done',
    count,
    total: list.length,
    detail: `Cases under ${scopeName} with Automation Type = Yes and Automation Status = Done (of ${list.length} cases)`,
    url: `${DEFS.testrail.baseUrl}/index.php?/suites/view/${suiteId}&group_id=${root.id}`,
    breakdown,
    cases: list,
    meta: { sectionName, sectionLabel },
  };
}

// ─── Jira (optional API token; else supplied counts; else keep previous) ──
async function searchJiraIssues(baseUrl, headers, jql, fields, maxIssues = 1000) {
  const issues = [];
  let nextPageToken = null;
  do {
    const body = { jql, fields, maxResults: 100 };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const data = await jsonFetch(`${baseUrl}/rest/api/3/search/jql`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    issues.push(...(data.issues || []));
    nextPageToken = data.isLast ? null : data.nextPageToken;
  } while (nextPageToken && issues.length < maxIssues);
  return issues;
}

// "QA Assignee" is a multi-user picker; plain "assignee" is a single user object.
function jiraUserNames(value) {
  if (!value) return '';
  const list = Array.isArray(value) ? value : [value];
  return list.map((u) => (u && (u.displayName || u.name)) || '').filter(Boolean).join(', ');
}

async function fetchJiraCount({ jiraDone = null, jiraTotal = null } = {}, previous) {
  const { baseUrl, epicKey, doneStatus, storyType, label, excludeStatuses, fields } = DEFS.jira;
  const filters = [
    storyType ? `"Story Type" = "${storyType}"` : null,
    label ? `labels = "${label}"` : null,
    excludeStatuses.length ? `status NOT IN (${excludeStatuses.map((s) => `"${s}"`).join(', ')})` : null,
  ].filter(Boolean);
  const scopeJql = [`parent = ${epicKey}`, ...filters].join(' AND ');
  const doneJql = `${scopeJql} AND status = "${doneStatus}"`;
  const scopeText = [storyType ? `Story Type = "${storyType}"` : null, label ? `label ${label}` : null]
    .filter(Boolean)
    .join(' and ');
  const base = {
    label: 'Jira — Done',
    detail: `Child issues of ${epicKey}${scopeText ? ` with ${scopeText}` : ''} in "${doneStatus}"${
      excludeStatuses.length ? ` (excludes ${excludeStatuses.join(' / ')})` : ''
    }`,
    // Deep-link straight to the filtered "Done" issue list, not just the epic.
    url: `${baseUrl}/issues/?jql=${encodeURIComponent(doneJql)}`,
    scopeUrl: `${baseUrl}/issues/?jql=${encodeURIComponent(scopeJql)}`,
    epicUrl: `${baseUrl}/browse/${epicKey}`,
    meta: { epicKey, storyType, label, doneStatus, excludeStatuses, jql: scopeJql },
  };

  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;

  if (email && token) {
    try {
      const auth = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
      const headers = { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' };
      const issues = await searchJiraIssues(baseUrl, headers, `${scopeJql} ORDER BY key ASC`, [
        'summary',
        'status',
        'labels',
        'assignee',
        fields.qaAssignee,
      ]);

      const rows = issues.map((issue) => {
        const f = issue.fields || {};
        const status = f.status || {};
        return {
          key: issue.key,
          url: `${baseUrl}/browse/${issue.key}`,
          title: f.summary || '',
          labels: f.labels || [],
          status: status.name || '',
          statusCategory: (status.statusCategory || {}).key || '',
          assignee: jiraUserNames(f.assignee),
          qaAssignee: jiraUserNames(f[fields.qaAssignee]),
          done: status.name === doneStatus,
        };
      });

      // Done first, then work in flight, then not-started, then Invalid/Dropped
      // (which Jira also files under the "done" status category).
      const rank = (r) =>
        r.done ? 0 : r.statusCategory === 'indeterminate' ? 1 : r.statusCategory === 'new' ? 2 : 3;
      rows.sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key, undefined, { numeric: true }));

      return {
        ...base,
        count: rows.filter((r) => r.done).length,
        total: rows.length,
        rows,
        source: 'jira-api',
      };
    } catch (err) {
      // Fall through to supplied counts / previous.
      base.warning = `Jira API failed: ${err.message}`;
    }
  }

  // Without live access the breakdown can't be rebuilt, so carry the last one over.
  const carriedRows = previous?.rows ? { rows: previous.rows } : {};

  if (jiraDone != null) {
    return {
      ...base,
      ...carriedRows,
      count: Number(jiraDone),
      total: jiraTotal != null ? Number(jiraTotal) : (previous?.total ?? null),
      source: 'supplied',
    };
  }
  if (previous && previous.count != null) {
    return { ...base, ...carriedRows, count: previous.count, total: previous.total, source: 'previous', stale: true };
  }
  return { ...base, count: null, total: null, source: 'none' };
}

// ─── Connection view (joins the three sources) ───────────────────────────
//
// The Google Sheet is the spine. It is the only source carrying BOTH foreign
// keys on every row (Jira key + TestRail case id); TestRail's "refs" field is
// only partly filled in and Jira carries no outbound key at all. Titles are
// useless as a join key — the three systems name the same test differently
// ("editMainProfileWeb" / "[WEB][UNM] Login - ..." / "User edit the main profile").
//
// Each row reports one of three states per source:
//   ok      — present and inside the source's filter
//   warn    — present but something needs attention (out of filter, duplicated,
//             or the sources disagree about the link)
//   missing — nothing to join to

const OK = 'ok';
const WARN = 'warn';
const MISSING = 'missing';

// Sheet keys that miss the in-scope Jira set may still exist under a different
// epic or label, which is far more actionable than reporting them as missing.
async function lookupJiraIssues(keys, max = 25) {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const found = new Map();
  if (!email || !token || keys.length === 0) return found;

  const { baseUrl, fields } = DEFS.jira;
  const headers = {
    Authorization: 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64'),
    Accept: 'application/json',
  };
  // One request per key: a single "key IN (...)" JQL fails outright if any one
  // of the keys does not exist, which is exactly the case we need to detect.
  for (const key of keys.slice(0, max)) {
    try {
      const data = await jsonFetch(
        `${baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}` +
          `?fields=summary,status,labels,parent,${fields.storyType}`,
        { headers },
        0
      );
      const f = data.fields || {};
      found.set(key, {
        key,
        title: f.summary || '',
        status: (f.status || {}).name || '',
        labels: f.labels || [],
        parentKey: (f.parent || {}).key || '',
        storyType: (f[fields.storyType] || {}).value || '',
      });
    } catch {
      // 404 (or anything else) → treat the key as unresolvable.
    }
  }
  return found;
}

function jiraScopeMismatch(issue) {
  const { epicKey, storyType, label, excludeStatuses } = DEFS.jira;
  const reasons = [];
  if (issue.parentKey !== epicKey) {
    reasons.push(issue.parentKey ? `parent is ${issue.parentKey}, not ${epicKey}` : `no parent epic`);
  }
  if (storyType && issue.storyType !== storyType) {
    reasons.push(`Story Type is "${issue.storyType || 'unset'}"`);
  }
  if (label && !issue.labels.includes(label)) reasons.push(`no ${label} label`);
  if (excludeStatuses.includes(issue.status)) reasons.push(`status is ${issue.status}`);
  return reasons;
}

async function buildConnections(sources) {
  const sheetRows = (sources.googleSheet?.rows || []).filter((r) => r.run);
  const jiraRows = sources.jira?.rows || [];
  const trCases = sources.testrail?.cases || [];

  const jiraByKey = new Map(jiraRows.map((j) => [j.key, j]));
  const trById = new Map(trCases.map((c) => [String(c.id), c]));
  const trScope = `${DEFS.testrail.sectionName}${DEFS.testrail.sectionLabel ? ` / ${DEFS.testrail.sectionLabel}` : ''}`;

  // Which TestRail cases point at a given Jira key, so an unclaimed Jira issue
  // can say "case X references you but the sheet maps it elsewhere".
  const refIndex = new Map();
  for (const c of trCases) {
    for (const ref of c.refs || []) {
      if (!refIndex.has(ref.key)) refIndex.set(ref.key, []);
      refIndex.get(ref.key).push(c);
    }
  }

  const sheetKeyUse = new Map();
  for (const r of sheetRows) {
    if (r.jiraKey) sheetKeyUse.set(r.jiraKey, (sheetKeyUse.get(r.jiraKey) || 0) + 1);
  }

  const unresolved = [...new Set(sheetRows.map((r) => r.jiraKey).filter((k) => k && !jiraByKey.has(k)))];
  const offScope = await lookupJiraIssues(unresolved);

  const rows = [];
  const usedTr = new Set();
  const usedJira = new Set();

  for (const r of sheetRows) {
    const trId = r.testrailId ? String(r.testrailId) : '';
    const tr = trId ? trById.get(trId) : null;
    if (tr) usedTr.add(trId);
    if (r.jiraKey && jiraByKey.has(r.jiraKey)) usedJira.add(r.jiraKey);

    const sheet = { state: OK, notes: [] };
    if (!r.jiraKey) sheet.notes.push('Sheet row has no Jira ID');
    if (!trId) sheet.notes.push('Sheet row has no TestRail ID');
    if (sheet.notes.length) sheet.state = WARN;

    const jira = { state: MISSING, notes: [] };
    if (jiraByKey.has(r.jiraKey)) {
      jira.state = OK;
      const uses = sheetKeyUse.get(r.jiraKey);
      if (uses > 1) {
        jira.state = WARN;
        jira.notes.push(`${r.jiraKey} is claimed by ${uses} sheet rows`);
      }
    } else if (!r.jiraKey) {
      jira.notes.push('No Jira ID in the sheet to match on');
    } else if (offScope.has(r.jiraKey)) {
      const reasons = jiraScopeMismatch(offScope.get(r.jiraKey));
      jira.state = WARN;
      jira.notes.push(
        `${r.jiraKey} exists but is outside the Jira filter${reasons.length ? ` — ${reasons.join('; ')}` : ''}`
      );
    } else {
      jira.notes.push(`${r.jiraKey} was not found in Jira`);
    }

    const testrail = { state: MISSING, notes: [] };
    if (tr) {
      testrail.state = OK;
      if (!tr.counted) {
        testrail.state = WARN;
        testrail.notes.push(`Case ${tr.id} is Automation ${tr.automationType} / ${tr.automationStatus}`);
      }
      const refKeys = (tr.refs || []).map((x) => x.key);
      if (refKeys.length === 0) {
        testrail.state = WARN;
        testrail.notes.push(`Case ${tr.id} has no Jira reference`);
      } else if (r.jiraKey && !refKeys.includes(r.jiraKey)) {
        testrail.state = WARN;
        testrail.notes.push(`Case ${tr.id} references ${refKeys.join(', ')} but the sheet says ${r.jiraKey}`);
      }
    } else if (!trId) {
      testrail.notes.push('No TestRail ID in the sheet to match on');
    } else {
      testrail.state = WARN;
      testrail.notes.push(`Case ${trId} is not under ${trScope}`);
    }

    rows.push({
      id: trId ? `tr:${trId}` : r.jiraKey ? `jira:${r.jiraKey}` : `sheet:${rows.length}`,
      testName: r.title || tr?.title || jiraByKey.get(r.jiraKey)?.title || '—',
      jiraKey: r.jiraKey || '',
      jiraUrl: r.jiraUrl || jiraByKey.get(r.jiraKey)?.url || null,
      testrailId: trId,
      testrailUrl: tr?.url || r.testrailUrl || null,
      sheet,
      jira,
      testrail,
    });
  }

  // In-scope TestRail cases that no sheet row claims.
  for (const c of trCases) {
    if (!c.counted || usedTr.has(String(c.id))) continue;
    const refKey = (c.refs || [])[0]?.key || '';
    const linked = refKey ? jiraByKey.get(refKey) : null;
    if (linked) usedJira.add(refKey);
    rows.push({
      id: `tr:${c.id}`,
      testName: c.title || '—',
      jiraKey: refKey,
      jiraUrl: (c.refs || [])[0]?.url || null,
      testrailId: String(c.id),
      testrailUrl: c.url,
      sheet: { state: MISSING, notes: [`No ShouldRun = y sheet row points at case ${c.id}`] },
      jira: linked
        ? { state: OK, notes: [] }
        : {
            state: MISSING,
            notes: [refKey ? `${refKey} is outside the Jira filter` : 'Case has no Jira reference'],
          },
      testrail: { state: OK, notes: [] },
    });
  }

  // In-scope Jira issues that nothing points at.
  for (const j of jiraRows) {
    if (usedJira.has(j.key)) continue;
    const referencing = refIndex.get(j.key) || [];
    const testrail = { state: MISSING, notes: [] };
    if (referencing.length) {
      const c = referencing[0];
      const owner = sheetRows.find((r) => String(r.testrailId) === String(c.id));
      testrail.state = WARN;
      testrail.notes.push(
        owner
          ? `Case ${c.id} references ${j.key} but the sheet maps that case to ${owner.jiraKey}`
          : `Case ${c.id} references ${j.key}`
      );
    } else {
      testrail.notes.push(`No TestRail case under ${trScope} references ${j.key}`);
    }
    rows.push({
      id: `jira:${j.key}`,
      testName: j.title || '—',
      jiraKey: j.key,
      jiraUrl: j.url,
      testrailId: referencing.length ? String(referencing[0].id) : '',
      testrailUrl: referencing.length ? referencing[0].url : null,
      sheet: { state: MISSING, notes: [`No ShouldRun = y sheet row points at ${j.key}`] },
      jira: { state: OK, notes: [] },
      testrail,
    });
  }

  for (const row of rows) {
    row.synced = row.sheet.state === OK && row.jira.state === OK && row.testrail.state === OK;
  }
  // Problems first so the worklist is at the top.
  rows.sort((a, b) => Number(a.synced) - Number(b.synced) || a.testName.localeCompare(b.testName));

  return {
    spine: 'googleSheet',
    total: rows.length,
    synced: rows.filter((r) => r.synced).length,
    rows,
  };
}

// ─── Reconciliation ──────────────────────────────────────────────────────
function reconcile(sources) {
  const counts = {
    googleSheet: sources.googleSheet?.count ?? null,
    jira: sources.jira?.count ?? null,
    testrail: sources.testrail?.count ?? null,
  };
  const nums = Object.values(counts).filter((n) => typeof n === 'number');
  const max = nums.length ? Math.max(...nums) : null;
  const min = nums.length ? Math.min(...nums) : null;
  return {
    counts,
    allMatch: nums.length === 3 && max === min,
    max,
    min,
    spread: max != null && min != null ? max - min : null,
  };
}

// ─── Snapshot IO ──────────────────────────────────────────────────────────
function readSnapshot() {
  if (!fs.existsSync(OUTPUT_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot) {
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(snapshot, null, 2) + '\n');
}

const SOURCE_KEYS = ['googleSheet', 'testrail', 'jira'];

/**
 * Fetch sources, write the snapshot, and return it. By default every source is
 * refreshed; pass `only` to refresh a subset and carry the rest over unchanged.
 * @param {object} opts
 * @param {number|null} opts.jiraDone  - Done count (used when no Jira API token).
 * @param {number|null} opts.jiraTotal - Total children count.
 * @param {string|string[]|null} opts.only - source key(s) to refresh; null = all.
 * @param {(msg: string) => void} [opts.onLog] - progress callback.
 */
async function refreshAutomationWeb({ jiraDone = null, jiraTotal = null, only = null, onLog = () => {} } = {}) {
  const previous = readSnapshot();
  const prev = previous?.sources || {};
  const now = new Date().toISOString();

  const wanted = only == null ? new Set(SOURCE_KEYS) : new Set(Array.isArray(only) ? only : [only]);
  for (const k of wanted) {
    if (!SOURCE_KEYS.includes(k)) throw new Error(`Unknown source "${k}" (expected: ${SOURCE_KEYS.join(', ')})`);
  }

  const sources = {};
  const errors = {};

  // Google Sheet
  if (wanted.has('googleSheet')) {
    onLog('Google Sheet…');
    try {
      sources.googleSheet = { ...(await fetchSheetCount()), fetchedAt: now };
      onLog(`Google Sheet: ${sources.googleSheet.count}/${sources.googleSheet.total}`);
    } catch (err) {
      errors.googleSheet = err.message;
      sources.googleSheet = prev.googleSheet
        ? { ...prev.googleSheet, stale: true }
        : { label: 'Google Sheet — ShouldRun: y', count: null, total: null };
      onLog(`Google Sheet FAILED: ${err.message}`);
    }
  } else if (prev.googleSheet) {
    sources.googleSheet = prev.googleSheet;
  }

  // TestRail
  if (wanted.has('testrail')) {
    onLog('TestRail…');
    try {
      sources.testrail = { ...(await fetchTestrailCount()), fetchedAt: now };
      onLog(`TestRail: ${sources.testrail.count}/${sources.testrail.total}`);
    } catch (err) {
      errors.testrail = err.message;
      sources.testrail = prev.testrail
        ? { ...prev.testrail, stale: true }
        : { label: 'TestRail — Automation Yes + Done', count: null, total: null };
      onLog(`TestRail FAILED: ${err.message}`);
    }
  } else if (prev.testrail) {
    sources.testrail = prev.testrail;
  }

  // Jira
  if (wanted.has('jira')) {
    onLog('Jira…');
    const jira = await fetchJiraCount({ jiraDone, jiraTotal }, prev.jira);
    // Only stamp a fresh time when we actually pulled a live/supplied value.
    jira.fetchedAt =
      jira.source === 'jira-api' || jira.source === 'supplied' ? now : prev.jira?.fetchedAt || null;
    sources.jira = jira;
    onLog(`Jira: ${jira.count ?? '—'}/${jira.total ?? '—'} (${jira.source})`);
  } else if (prev.jira) {
    sources.jira = prev.jira;
  }

  const snapshot = {
    lastUpdated: now,
    generatedBy: 'src/lib/automationWeb.js',
    platform: 'WEB (dWeb) — Eiffel',
    refreshed: [...wanted],
    sources,
    connections: await buildConnections(sources),
    reconciliation: reconcile(sources),
    errors: Object.keys(errors).length ? errors : undefined,
  };

  writeSnapshot(snapshot);
  return snapshot;
}

module.exports = {
  DEFS,
  OUTPUT_FILE,
  refreshAutomationWeb,
  readSnapshot,
};
