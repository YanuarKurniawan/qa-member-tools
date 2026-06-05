function createLogger() {
  const logs = [];
  const timestamp = () => new Date().toISOString();

  const formatMessage = (msg) => {
    if (typeof msg === 'object') {
      try {
        return JSON.stringify(msg);
      } catch {
        return String(msg);
      }
    }
    return String(msg);
  };

  const logToTerminal = (type, msg) => {
    const prefix = `[${timestamp()}] [${type.toUpperCase()}]`;
    const formattedMsg = formatMessage(msg);
    const writer = type === 'error' ? console.error : type === 'warn' ? console.warn : console.log;
    writer(`${prefix} ${formattedMsg}`);
  };

  const makeLog = (type) => (msg) => {
    logToTerminal(type, msg);
    logs.push({ type, message: formatMessage(msg) });
  };

  return {
    info: makeLog('info'),
    success: makeLog('success'),
    error: makeLog('error'),
    warn: makeLog('warn'),
    debug: makeLog('debug'),
    getLogs: () => logs,
  };
}

module.exports = { createLogger };
