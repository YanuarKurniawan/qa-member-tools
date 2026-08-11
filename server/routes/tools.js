const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const registry = require('../../src/registry');
const upload = require('../middleware/upload');
const { parseCsvFile, cleanupFile } = require('../../src/lib/csvParser');
const { createLogger } = require('../../src/lib/logger');

const SERVICES_DIR = path.join(__dirname, '../../src/services');

function loadService(tool) {
  return require(path.join(SERVICES_DIR, tool.service));
}

router.get('/', (req, res) => {
  const tools = registry.map(({ service, ...meta }) => meta);
  res.json(tools);
});

// SSE streaming endpoint for tools that support it
router.post('/:toolId/stream', upload.single('file'), async (req, res) => {
  const tool = registry.find((t) => t.id === req.params.toolId);
  if (!tool) return res.status(404).json({ error: 'Tool not found' });
  if (!tool.streamable) return res.status(400).json({ error: 'Tool does not support streaming' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const abortController = new AbortController();
  const { signal } = abortController;

  req.on('close', () => {
    abortController.abort();
  });

  const send = (event, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const streamLogger = {
    info: (msg) => send('log', { type: 'info', message: typeof msg === 'object' ? JSON.stringify(msg) : String(msg) }),
    success: (msg) => send('log', { type: 'success', message: typeof msg === 'object' ? JSON.stringify(msg) : String(msg) }),
    error: (msg) => send('log', { type: 'error', message: typeof msg === 'object' ? JSON.stringify(msg) : String(msg) }),
    warn: (msg) => send('log', { type: 'warn', message: typeof msg === 'object' ? JSON.stringify(msg) : String(msg) }),
    debug: (msg) => send('log', { type: 'debug', message: typeof msg === 'object' ? JSON.stringify(msg) : String(msg) }),
  };

  try {
    const serviceFn = loadService(tool);
    let rows = [];
    if (req.file) {
      rows = await parseCsvFile(req.file.path);
    }

    const options = { ...req.body };

    send('progress', { current: 0, total: rows.length, phase: 'starting' });

    const originalInfo = streamLogger.info;
    let currentRow = 0;
    streamLogger.info = (msg) => {
      const str = typeof msg === 'object' ? JSON.stringify(msg) : String(msg);
      const match = str.match(/\[(\d+)\/(\d+)\]/);
      if (match) {
        currentRow = parseInt(match[1], 10);
        send('progress', { current: currentRow, total: rows.length, phase: 'processing' });
      }
      originalInfo(msg);
    };

    const result = await serviceFn({ rows, options, onLog: streamLogger, signal });

    send('progress', { current: rows.length, total: rows.length, phase: signal.aborted ? 'stopped' : 'done' });
    send('result', { results: result.results || [] });
    send('done', { stopped: signal.aborted });
  } catch (err) {
    send('error', { message: err.message });
  } finally {
    cleanupFile(req.file?.path);
    res.end();
  }
});

router.post('/:toolId', upload.single('file'), async (req, res) => {
  const tool = registry.find((t) => t.id === req.params.toolId);
  if (!tool) return res.status(404).json({ error: 'Tool not found' });

  const log = createLogger();

  try {
    const serviceFn = loadService(tool);
    let rows = [];
    if (req.file) {
      rows = await parseCsvFile(req.file.path);
    }

    const options = { ...req.body };

    const result = await (typeof serviceFn === 'function'
      ? serviceFn({ rows, options, onLog: log })
      : serviceFn.preview({ rows, options, onLog: log }));

    res.json({ logs: log.getLogs(), ...result });
  } catch (err) {
    log.error(`Error: ${err.message}`);
    res.status(500).json({ error: err.message, logs: log.getLogs() });
  } finally {
    cleanupFile(req.file?.path);
  }
});

router.post('/:toolId/confirm', upload.single('file'), async (req, res) => {
  const tool = registry.find((t) => t.id === req.params.toolId);
  if (!tool) return res.status(404).json({ error: 'Tool not found' });

  const log = createLogger();

  try {
    const serviceFn = loadService(tool);
    if (!serviceFn.confirm) {
      return res.status(400).json({ error: 'Tool does not support confirm step' });
    }

    let rows = [];
    if (req.file) {
      rows = await parseCsvFile(req.file.path);
    }

    const options = { ...req.body };

    const result = await serviceFn.confirm({
      rows,
      options,
      onLog: log,
    });

    res.json({ logs: log.getLogs(), ...result });
  } catch (err) {
    log.error(`Error: ${err.message}`);
    res.status(500).json({ error: err.message, logs: log.getLogs() });
  } finally {
    cleanupFile(req.file?.path);
  }
});

module.exports = router;
