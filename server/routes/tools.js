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
