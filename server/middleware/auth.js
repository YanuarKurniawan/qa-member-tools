function apiKeyAuth(req, res, next) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return next();

  const provided =
    req.headers['x-api-key'] || req.query.apiKey;

  if (provided !== apiKey) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing API key' });
  }
  next();
}

module.exports = { apiKeyAuth };
