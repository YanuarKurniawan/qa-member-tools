const config = require('./config');
const sleep = require('./sleep');

const PAGE_LIMIT = 250;
const MAX_RETRIES = 3;
const TRANSIENT = /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network/i;

class TestRailError extends Error {
  constructor(message, { status = null, endpoint = null } = {}) {
    super(message);
    this.name = 'TestRailError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

function authHeader() {
  if (!config.TESTRAIL_USER || !config.TESTRAIL_API_KEY) {
    throw new TestRailError(
      'TestRail credentials missing. Set TESTRAIL_USER and TESTRAIL_API_KEY in .env'
    );
  }
  const raw = `${config.TESTRAIL_USER}:${config.TESTRAIL_API_KEY}`;
  return 'Basic ' + Buffer.from(raw).toString('base64');
}

function url(endpoint) {
  return `${config.TESTRAIL_BASE_URL}/index.php?/api/v2/${endpoint}`;
}

async function request(method, endpoint, body) {
  const headers = { Authorization: authHeader(), 'Content-Type': 'application/json' };
  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res;
    try {
      res = await fetch(url(endpoint), init);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES && TRANSIENT.test(err.message)) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      throw new TestRailError(`TestRail request failed: ${err.message}`, { endpoint });
    }

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2 * (attempt + 1)) * 1000);
      continue;
    }

    const text = await res.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!res.ok) {
      const detail = (payload && payload.error) || text.slice(0, 200) || 'no response body';
      throw new TestRailError(
        `TestRail ${method} ${endpoint.split('&')[0]} failed (HTTP ${res.status}): ${detail}`,
        { status: res.status, endpoint }
      );
    }
    return payload;
  }

  throw new TestRailError(
    `TestRail ${method} ${endpoint.split('&')[0]} failed after ${MAX_RETRIES} retries: ${
      lastError ? lastError.message : 'rate limited'
    }`,
    { endpoint }
  );
}

// TestRail's bulk endpoints return { <key>: [...], offset, limit, size } on
// modern instances and a bare array on older ones. Handle both.
async function getPaginated(endpoint, key) {
  const out = [];
  let offset = 0;
  for (;;) {
    const page = await request('GET', `${endpoint}&limit=${PAGE_LIMIT}&offset=${offset}`);
    const items = Array.isArray(page) ? page : (page && page[key]) || [];
    out.push(...items);
    if (items.length < PAGE_LIMIT) return out;
    offset += PAGE_LIMIT;
  }
}

// A single-suite project takes no suite_id and rejects the parameter outright.
function suiteScope(projectId, suiteId) {
  return `${projectId}${suiteId ? `&suite_id=${suiteId}` : ''}`;
}

module.exports = {
  TestRailError,
  getRun: (runId) => request('GET', `get_run/${runId}`),
  getTests: (runId) => getPaginated(`get_tests/${runId}`, 'tests'),
  getSections: (projectId, suiteId) =>
    getPaginated(`get_sections/${suiteScope(projectId, suiteId)}`, 'sections'),
  getCases: (projectId, suiteId) =>
    getPaginated(`get_cases/${suiteScope(projectId, suiteId)}`, 'cases'),
  getStatuses: () => request('GET', 'get_statuses'),
  getPriorities: () => request('GET', 'get_priorities'),
  getResultFields: () => request('GET', 'get_result_fields'),
  updateCase: (caseId, fields) => request('POST', `update_case/${caseId}`, fields),
  addResultsForCases: (runId, results) =>
    request('POST', `add_results_for_cases/${runId}`, { results }),
};
