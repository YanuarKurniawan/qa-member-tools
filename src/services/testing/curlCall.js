const config = require('../../lib/config');

function isUrlAllowed(rawUrl) {
  const allowedHosts = config.ALLOWED_CURL_HOSTS;
  if (allowedHosts.length === 0) return true;
  try {
    const parsed = new URL(rawUrl);
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(parsed.hostname)) return false;
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(parsed.hostname)) return false;
    if (parsed.hostname === '169.254.169.254') return false;
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return allowedHosts.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function parseCurl(curlCommand) {
  curlCommand = curlCommand.replace(/\\\s*\n/g, ' ').trim();
  const tokens = tokenize(curlCommand);

  let url = '';
  let method = 'GET';
  let headers = {};
  let data = null;

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '-X' && tokens[i + 1]) method = tokens[++i];
    else if (tokens[i].startsWith('http')) url = tokens[i];
    else if (tokens[i] === '-H' && tokens[i + 1]) {
      const header = tokens[++i];
      const colonIdx = header.indexOf(':');
      if (colonIdx > 0) {
        headers[header.slice(0, colonIdx).trim()] = header.slice(colonIdx + 1).trim();
      }
    } else if ((tokens[i] === '-d' || tokens[i] === '--data') && tokens[i + 1]) {
      data = tokens[++i];
    }
  }

  return { url, method, headers, data };
}

function tokenize(str) {
  const tokens = [];
  let current = '';
  let inQuote = null;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (inQuote) {
      if (c === inQuote) {
        inQuote = null;
      } else {
        current += c;
      }
    } else if (c === '"' || c === "'") {
      inQuote = c;
    } else if (c === ' ' || c === '\t') {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += c;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

module.exports = async function curlCall({ rows, options, onLog }) {
  onLog.info(`Processing ${rows.length} curl commands`);
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const curlText = rows[i].Steps;
    if (!curlText) {
      results.push({ ...rows[i], 'Status Code': '', Response: '' });
      continue;
    }

    try {
      const { url, method, headers, data } = parseCurl(curlText);

      if (!isUrlAllowed(url)) {
        onLog.error(`[${i + 1}/${rows.length}] Blocked URL: ${url}`);
        results.push({ ...rows[i], 'Status Code': 'BLOCKED', Response: 'URL not in allowlist' });
        continue;
      }

      onLog.info(`[${i + 1}/${rows.length}] ${method} ${url}`);

      const fetchRes = await fetch(url, { method, headers, body: data });
      const text = await fetchRes.text();

      onLog.success(`${method} ${url} → ${fetchRes.status}`);
      results.push({
        ...rows[i],
        'Status Code': fetchRes.status,
        Response: text.substring(0, 500),
      });
    } catch (err) {
      onLog.error(`Row ${i + 1} error: ${err.message}`);
      results.push({ ...rows[i], 'Status Code': 'ERR', Response: err.message });
    }
  }

  return { results };
};
