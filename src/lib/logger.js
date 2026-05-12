function createLogger() {
  const logs = [];
  return {
    info: (msg) => logs.push({ type: 'info', message: String(msg) }),
    success: (msg) => logs.push({ type: 'success', message: String(msg) }),
    error: (msg) => logs.push({ type: 'error', message: String(msg) }),
    warn: (msg) => logs.push({ type: 'warn', message: String(msg) }),
    getLogs: () => logs,
  };
}

module.exports = { createLogger };
