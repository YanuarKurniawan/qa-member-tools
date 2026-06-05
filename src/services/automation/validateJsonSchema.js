const Ajv = require('ajv');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const DRAFT_PATTERNS = {
  'draft-04': 'draft-07',
  'draft-06': 'draft-07',
  'draft-07': 'draft-07',
  'draft/2019-09': '2019-09',
  'draft/2020-12': '2020-12',
};

function detectDraft(schema) {
  const $schema = schema.$schema || '';
  for (const [pattern, draft] of Object.entries(DRAFT_PATTERNS)) {
    if ($schema.includes(pattern)) return draft;
  }
  return 'draft-07';
}

function createValidator(draft) {
  const AjvClass = draft === '2020-12' ? Ajv2020 : Ajv;
  const ajv = new AjvClass({ allErrors: true, verbose: true, strict: false });
  addFormats(ajv);
  return ajv;
}

function mapErrorsToLines(prettyJson, errors) {
  const lines = prettyJson.split('\n');
  const lineErrors = {};
  const unmapped = [];

  for (const error of errors) {
    const path = error.instancePath || '';
    const msg =
      error.keyword === 'required'
        ? `missing required property "${error.params.missingProperty}"`
        : error.message;

    if (!path) {
      if (error.keyword === 'required') {
        if (!lineErrors[0]) lineErrors[0] = [];
        lineErrors[0].push(msg);
      } else {
        unmapped.push(msg);
      }
      continue;
    }

    const parts = path.split('/').filter(Boolean);
    let startSearch = 0;
    let lastFoundLine = -1;

    for (const [p, part] of parts.entries()) {
      if (/^\d+$/.test(part)) continue;

      const indent = '  '.repeat(p + 1);
      const keyPrefix = `${indent}"${part}"`;

      for (let i = startSearch; i < lines.length; i++) {
        if (lines[i].startsWith(keyPrefix)) {
          lastFoundLine = i;
          startSearch = i + 1;
          break;
        }
      }
    }

    if (lastFoundLine >= 0) {
      if (!lineErrors[lastFoundLine]) lineErrors[lastFoundLine] = [];
      lineErrors[lastFoundLine].push(msg);
    } else {
      unmapped.push(`${path}: ${msg}`);
    }
  }

  return { lineErrors, unmapped };
}

module.exports = async function validateJsonSchema({ options, onLog }) {
  const { schemaInput, jsonInput } = options;

  if (!schemaInput || !schemaInput.trim()) {
    throw new Error('JSON Schema is required');
  }
  if (!jsonInput || !jsonInput.trim()) {
    throw new Error('JSON input is required');
  }

  let schema;
  try {
    schema = JSON.parse(schemaInput);
  } catch (err) {
    throw new Error(`Invalid JSON Schema: ${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(jsonInput);
  } catch (err) {
    throw new Error(`Invalid JSON input: ${err.message}`);
  }

  const draft = detectDraft(schema);
  onLog.info(`Detected schema draft: ${draft}`);

  const ajv = createValidator(draft);

  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (err) {
    throw new Error(`Schema compilation failed: ${err.message}`);
  }

  const valid = validate(data);
  const prettyJson = JSON.stringify(data, null, 2);
  const lines = prettyJson.split('\n');

  if (valid) {
    onLog.success('Validation passed — JSON is valid against the schema');
    return {
      message: 'JSON is valid against the schema',
      annotatedJson: {
        lines,
        errors: {},
        unmappedErrors: [],
      },
      results: [],
    };
  }

  const errors = validate.errors || [];
  onLog.error(`Validation failed — ${errors.length} error(s) found`);

  const { lineErrors, unmapped } = mapErrorsToLines(prettyJson, errors);

  return {
    message: `Validation failed with ${errors.length} error(s)`,
    annotatedJson: {
      lines,
      errors: lineErrors,
      unmappedErrors: unmapped,
    },
    results: [],
  };
};
