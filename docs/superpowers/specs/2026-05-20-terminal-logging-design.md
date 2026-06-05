# Design Doc: Terminal Logging for QA Tools

## Overview
The user wants to see detailed logs in the terminal when running tools from the web UI. Currently, logs are only collected in-memory and sent to the browser's "Output Log" panel.

## Goals
1. Enable terminal logging for all tools in the suite.
2. Provide detailed debug information for the "Batch Register (GK)" tool to investigate OTP failures.

## Proposed Changes

### 1. Global Terminal Logging (`src/lib/logger.js`)
Modify the `createLogger` function to support detailed logging for all tools.

**Implementation Details:**
- Add a `debug` method for detailed technical logs.
- Support logging objects directly in all methods (`info`, `success`, `warn`, `error`, `debug`).
- Objects are pretty-printed in the terminal and stringified for the UI.
- Add ISO timestamps and status prefixes to all terminal output.

```javascript
function createLogger() {
  const logs = [];
  const timestamp = () => new Date().toISOString();

  const formatMessage = (msg) => {
    if (typeof msg === 'object') {
      try {
        return JSON.stringify(msg, null, 2);
      } catch (e) {
        return String(msg);
      }
    }
    return String(msg);
  };

  const logToTerminal = (type, msg) => {
    const prefix = `[${timestamp()}] [${type.toUpperCase()}]`;
    const formattedMsg = formatMessage(msg);
    if (type === 'error') {
      console.error(`${prefix}\n${formattedMsg}`);
    } else if (type === 'warn') {
      console.warn(`${prefix}\n${formattedMsg}`);
    } else {
      console.log(`${prefix} ${formattedMsg}`);
    }
  };

  return {
    info: (msg) => {
      logToTerminal('info', msg);
      logs.push({ type: 'info', message: String(typeof msg === 'object' ? JSON.stringify(msg) : msg) });
    },
    // ... success, error, warn, debug ...
  };
}
```

### 2. Standardized Debugging
All tools should now use `onLog.debug(object)` to log detailed API requests, responses, and internal state. This ensures a consistent debugging experience across the entire suite.

### 3. Curl Generation for Failed API Calls
When an API call fails (either due to a network error or a non-success response status), the tool should provide a `curl` command in the terminal. This allows developers to quickly reproduce the failure outside of the tool.

**Implementation Example:**
```javascript
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

// In the service:
if (!success) {
  onLog.error(`API failed. Reproduction curl:\n${toCurl(url, options)}`);
}
```

## Success Criteria
- Running any tool from the web UI results in corresponding logs appearing in the server terminal.
- Running "Batch Register (GK)" shows detailed API request/response data in the terminal, allowing us to see why OTP generation is failing.
