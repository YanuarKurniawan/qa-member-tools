function generatePaths(obj, prefix = 'x') {
  const paths = [];

  function traverse(value, currentPath) {
    if (value === null) {
      paths.push({ path: currentPath, value: null, type: 'null', preview: 'null' });
      return;
    }

    const type = Array.isArray(value) ? 'array' : typeof value;

    paths.push({
      path: currentPath,
      value: type === 'object' || type === 'array' ? null : value,
      type,
      preview: type === 'object'
        ? `{${Object.keys(value).length} keys}`
        : type === 'array'
          ? `[${value.length} items]`
          : JSON.stringify(value),
    });

    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          traverse(item, `${currentPath}[${index}]`);
        });
      } else {
        for (const key of Object.keys(value)) {
          const safePath = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
            ? `${currentPath}.${key}`
            : `${currentPath}["${key}"]`;
          traverse(value[key], safePath);
        }
      }
    }
  }

  traverse(obj, prefix);
  return paths;
}

function evaluatePath(obj, pathExpr) {
  const normalized = pathExpr.replace(/^x\.?/, '');
  if (!normalized) return obj;

  const tokens = [];
  const regex = /\.?([a-zA-Z_$][a-zA-Z0-9_$]*|\["[^"]*"\])|\[(\d+|\*)\]/g;
  let match;
  while ((match = regex.exec(normalized)) !== null) {
    if (match[2] !== undefined) {
      tokens.push(match[2]);
    } else {
      const key = match[1].startsWith('["')
        ? match[1].slice(2, -2)
        : match[1];
      tokens.push(key);
    }
  }

  let current = obj;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;

    if (token === '*') {
      if (!Array.isArray(current)) return undefined;
      return current;
    }

    if (/^\d+$/.test(token)) {
      current = current[parseInt(token, 10)];
    } else {
      current = current[token];
    }
  }
  return current;
}

function parseCondition(condStr) {
  condStr = condStr.trim();

  const opMatch = condStr.match(/^\.([a-zA-Z_$][a-zA-Z0-9_$.]*)\s*(==|!=|>=|<=|>|<|contains|startsWith|endsWith)\s*(.+)$/);
  if (opMatch) {
    const [, field, operator, rawValue] = opMatch;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    } else if (value === 'null') {
      value = null;
    } else if (!isNaN(Number(value))) {
      value = Number(value);
    }
    return { field, operator, value };
  }
  return null;
}

function getNestedValue(obj, fieldPath) {
  const parts = fieldPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function matchesCondition(item, condition) {
  if (!condition) return true;
  const { field, operator, value } = condition;
  const itemValue = getNestedValue(item, field);

  switch (operator) {
    case '==': return itemValue == value;
    case '!=': return itemValue != value;
    case '>': return itemValue > value;
    case '<': return itemValue < value;
    case '>=': return itemValue >= value;
    case '<=': return itemValue <= value;
    case 'contains': return String(itemValue || '').includes(String(value));
    case 'startsWith': return String(itemValue || '').startsWith(String(value));
    case 'endsWith': return String(itemValue || '').endsWith(String(value));
    default: return false;
  }
}

function applyStreamOperations(array, expression) {
  const ops = [];
  const opRegex = /(?:^|\.)(filter|map|find|count|distinct|sort|limit|min|max|sum|avg)\(([^)]*)\)/g;
  let m;
  while ((m = opRegex.exec(expression)) !== null) {
    ops.push({ name: m[1], arg: m[2].trim() });
  }

  if (ops.length === 0) {
    const simpleOps = expression.split('.').filter(Boolean);
    for (const op of simpleOps) {
      const parenMatch = op.match(/^(\w+)\(([^)]*)\)$/);
      if (parenMatch) {
        ops.push({ name: parenMatch[1], arg: parenMatch[2].trim() });
      }
    }
  }

  let result = [...array];

  for (const op of ops) {
    switch (op.name) {
      case 'filter': {
        const condition = parseCondition(op.arg);
        if (condition) {
          result = result.filter(item => matchesCondition(item, condition));
        }
        break;
      }
      case 'map': {
        const field = op.arg.replace(/^\./, '');
        result = result.map(item => getNestedValue(item, field));
        break;
      }
      case 'find': {
        const condition = parseCondition(op.arg);
        if (condition) {
          const found = result.find(item => matchesCondition(item, condition));
          result = found !== undefined ? [found] : [];
        }
        break;
      }
      case 'count': {
        return { type: 'aggregate', value: result.length };
      }
      case 'distinct': {
        const field = op.arg.replace(/^\./, '');
        if (field) {
          const seen = new Set();
          result = result
            .map(item => getNestedValue(item, field))
            .filter(v => {
              const key = JSON.stringify(v);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
        } else {
          const seen = new Set();
          result = result.filter(v => {
            const key = JSON.stringify(v);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        break;
      }
      case 'sort': {
        const parts = op.arg.split(',').map(s => s.trim());
        const field = parts[0] ? parts[0].replace(/^\./, '') : '';
        const desc = parts[1] === 'desc';
        if (field) {
          result.sort((a, b) => {
            const va = getNestedValue(a, field);
            const vb = getNestedValue(b, field);
            if (va < vb) return desc ? 1 : -1;
            if (va > vb) return desc ? -1 : 1;
            return 0;
          });
        } else {
          result.sort((a, b) => {
            if (a < b) return desc ? 1 : -1;
            if (a > b) return desc ? -1 : 1;
            return 0;
          });
        }
        break;
      }
      case 'limit': {
        const n = parseInt(op.arg, 10);
        if (!isNaN(n)) result = result.slice(0, n);
        break;
      }
      case 'min': {
        const field = op.arg.replace(/^\./, '');
        const values = field
          ? result.map(item => getNestedValue(item, field)).filter(v => typeof v === 'number')
          : result.filter(v => typeof v === 'number');
        return { type: 'aggregate', value: values.length ? Math.min(...values) : null };
      }
      case 'max': {
        const field = op.arg.replace(/^\./, '');
        const values = field
          ? result.map(item => getNestedValue(item, field)).filter(v => typeof v === 'number')
          : result.filter(v => typeof v === 'number');
        return { type: 'aggregate', value: values.length ? Math.max(...values) : null };
      }
      case 'sum': {
        const field = op.arg.replace(/^\./, '');
        const values = field
          ? result.map(item => getNestedValue(item, field)).filter(v => typeof v === 'number')
          : result.filter(v => typeof v === 'number');
        return { type: 'aggregate', value: values.reduce((s, v) => s + v, 0) };
      }
      case 'avg': {
        const field = op.arg.replace(/^\./, '');
        const values = field
          ? result.map(item => getNestedValue(item, field)).filter(v => typeof v === 'number')
          : result.filter(v => typeof v === 'number');
        return { type: 'aggregate', value: values.length ? values.reduce((s, v) => s + v, 0) / values.length : null };
      }
    }
  }

  return { type: 'array', value: result };
}

module.exports = async function jsonPathFinder({ options, onLog }) {
  const { jsonInput, pathExpression, filterExpression } = options;

  if (!jsonInput || !jsonInput.trim()) {
    throw new Error('JSON input is required');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonInput);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err.message}`);
  }

  onLog.info('JSON parsed successfully');

  const paths = generatePaths(parsed);
  onLog.info(`Found ${paths.length} paths in the JSON structure`);

  let evaluatedValue = undefined;
  let filteredResult = undefined;

  if (pathExpression && pathExpression.trim()) {
    evaluatedValue = evaluatePath(parsed, pathExpression.trim());
    if (evaluatedValue !== undefined) {
      onLog.success(`Path "${pathExpression}" resolved successfully`);
    } else {
      onLog.warn(`Path "${pathExpression}" returned undefined`);
    }
  }

  if (filterExpression && filterExpression.trim()) {
    const targetArray = Array.isArray(evaluatedValue)
      ? evaluatedValue
      : Array.isArray(parsed)
        ? parsed
        : null;

    if (!targetArray) {
      onLog.warn('Filter expression requires an array target. Use a path expression that resolves to an array.');
    } else {
      try {
        filteredResult = applyStreamOperations(targetArray, filterExpression.trim());
        if (filteredResult.type === 'aggregate') {
          onLog.success(`Stream operation result: ${filteredResult.value}`);
        } else {
          onLog.success(`Stream filter returned ${filteredResult.value.length} items`);
        }
      } catch (err) {
        onLog.error(`Filter error: ${err.message}`);
      }
    }
  }

  return {
    message: 'JSON path analysis complete',
    paths,
    evaluatedValue: evaluatedValue !== undefined ? evaluatedValue : null,
    filteredResult: filteredResult || null,
    results: [],
  };
};
