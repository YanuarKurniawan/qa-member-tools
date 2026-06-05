function toCurl(url, options = {}) {
  const { method = 'GET', headers = {}, body } = options;
  let curl = `curl -X ${method.toUpperCase()} "${url}"`;

  Object.entries(headers).forEach(([key, value]) => {
    curl += ` -H "${key}: ${value}"`;
  });

  if (body) {
    const data = typeof body === 'object' ? JSON.stringify(body) : body;
    curl += ` -d '${data.replace(/'/g, "'\\''")}'`;
  }

  return curl;
}

module.exports = toCurl;
