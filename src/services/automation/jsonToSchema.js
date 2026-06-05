function inferSchema(value) {
  if (value === null) return { type: 'null' };

  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'array', items: {} };
    return { type: 'array', items: inferSchema(value[0]) };
  }

  switch (typeof value) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'object': {
      const properties = {};
      const keys = Object.keys(value);
      for (const key of keys) {
        properties[key] = inferSchema(value[key]);
      }
      return {
        type: 'object',
        properties,
        required: keys,
      };
    }
    default:
      return {};
  }
}

module.exports = async function jsonToSchema({ options, onLog }) {
  const { jsonInput } = options;

  if (!jsonInput || !jsonInput.trim()) {
    throw new Error('JSON input is required');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonInput);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err.message}`);
  }

  onLog.info('Parsed JSON successfully');

  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    ...inferSchema(parsed),
  };

  const schemaStr = JSON.stringify(schema, null, 2);
  const propCount = schemaStr.split('"type"').length - 1;
  onLog.success(`Schema generated — ${propCount} type definitions`);

  return {
    message: 'JSON Schema generated successfully',
    schema: schemaStr,
    results: [],
  };
};
