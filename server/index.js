const path = require('path');
const config = require('../src/lib/config');

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
const { apiKeyAuth } = require('./middleware/auth');

const app = express();
const PORT = config.PORT;

const allowedOrigins = config.CORS_ALLOWED_ORIGINS
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    },
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', apiKeyAuth);

app.use('/api/tools', require('./routes/tools'));

const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err.message === 'Only CSV files are allowed') {
    return res.status(400).json({ error: err.message });
  }

  console.error('Unhandled error:', err);
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';
  res.status(500).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`QA Tools API server running at http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
