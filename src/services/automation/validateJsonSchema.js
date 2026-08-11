const Ajv = require('ajv');
const Ajv2019 = require('ajv/dist/2019');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const DRAFT_META = {
  'draft-07': 'http://json-schema.org/draft-07/schema#',
  '2019-09': 'https://json-schema.org/draft/2019-09/schema',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
};

const DRAFT_PATTERNS = [
  { pattern: 'draft-04', draft: 'draft-07', rewrite: true },
  { pattern: 'draft-06', draft: 'draft-07', rewrite: true },
  { pattern: 'draft-07', draft: 'draft-07', rewrite: false },
  { pattern: 'draft/2019-09', draft: '2019-09', rewrite: false },
  { pattern: 'draft/2020-12', draft: '2020-12', rewrite: false },
];

function detectDraft(schema) {
  const $schema = schema.$schema || '';
  for (const entry of DRAFT_PATTERNS) {
    if ($schema.includes(entry.pattern)) return entry;
  }
  return { pattern: null, draft: 'draft-07', rewrite: false };
}

function createValidator(draft) {
  let AjvClass = Ajv;
  if (draft === '2020-12') AjvClass = Ajv2020;
  else if (draft === '2019-09') AjvClass = Ajv2019;

  const ajv = new AjvClass({ allErrors: true, verbose: true, strict: false });
  addFormats(ajv);
  return ajv;
}

/**
 * Ajv 8 does not ship draft-04/06 meta-schemas. When a schema declares those
 * drafts, rewrite $schema to the closest supported meta-schema so compile()
 * can resolve the ref.
 */
function prepareSchema(schema, draftInfo) {
  if (!draftInfo.rewrite || !schema.$schema) return schema;
  return {
    ...schema,
    $schema: DRAFT_META[draftInfo.draft],
  };
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

  const draftInfo = detectDraft(schema);
  onLog.info(`Detected schema draft: ${draftInfo.draft}${draftInfo.rewrite ? ` (rewritten from ${draftInfo.pattern})` : ''}`);

  const ajv = createValidator(draftInfo.draft);
  const schemaToCompile = prepareSchema(schema, draftInfo);

  let validate;
  try {
    validate = ajv.compile(schemaToCompile);
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
