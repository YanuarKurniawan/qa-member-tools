# Contributing Guidelines

Thank you for contributing to QA Member Tools! This document provides guidelines and instructions for contributing.

## Code Style & Standards

### File Naming
- Use **kebab-case** for files: `batch-register.js`, `get-testrail-link.js`
- Use **PascalCase** for classes: `JiraClient.js`, `CSVParser.js`
- Use **camelCase** for functions: `processCSV()`, `fetchJiraIssue()`

### JavaScript Standards
- Use **ES6+** syntax
- Use `const` and `let`, avoid `var`
- Use async/await, avoid promise chains
- Add JSDoc comments for functions
- Keep functions small and focused

### Example Function:
```javascript
/**
 * Fetch Jira issue details
 * @param {string} issueKey - The Jira issue key (e.g., QAAUT-12345)
 * @param {string} field - Field to fetch
 * @returns {Promise<object>} Issue details
 */
async function fetchJiraIssue(issueKey, field = 'description') {
  try {
    const response = await axios.get(
      `${JIRA_BASE_URL}/rest/api/2/issue/${issueKey}`,
      {
        auth: {
          username: JIRA_USERNAME,
          password: JIRA_API_TOKEN,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error(`Error fetching issue ${issueKey}:`, error.message);
    throw error;
  }
}
```

## Adding New Tools

### Step 1: Determine Category
Choose the appropriate category:
- **user-management** - User registration, password, tier updates
- **user-auth** - Role, privilege, email management
- **jira** - Jira API integrations
- **testing** - TestRail, Sheet operations
- **performance** - K6, Lighthouse tests

### Step 2: Create Tool File
```bash
# Create file with kebab-case name
src/tools/<category>/<tool-name>.js
```

### Step 3: Implement Tool
```javascript
require('dotenv').config({ path: '../../../.env' });

const axios = require('axios');
const fs = require('fs');

// Configuration
const API_URL = process.env.YOUR_API_URL;
const API_KEY = process.env.YOUR_API_KEY;

/**
 * Main tool functionality
 */
async function main() {
  try {
    console.log('Starting tool...');
    
    // Your implementation
    
    console.log('Tool completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
```

### Step 4: Update package.json
Add npm script:
```json
{
  "scripts": {
    "your-tool": "node src/tools/category/tool-name.js"
  }
}
```

### Step 5: Document Tool
Create `src/tools/<category>/README.md`:
```markdown
# Your Tool Name

Brief description

## Usage
npm run your-tool [options]

## Input/Output
- Input: ...
- Output: ...

## Examples
...

## Notes
...
```

### Step 6: Update Documentation
Update `docs/TOOLS.md` with tool description and usage.

## Creating Shared Utilities

### Guidelines
1. Extract common functionality to `src/lib/`
2. Use meaningful names
3. Make reusable and generic
4. Add comprehensive comments

### Example Utility:
```javascript
// src/lib/api-client.js
const axios = require('axios');

/**
 * Generic API client with auth and retry logic
 */
class APIClient {
  constructor(baseURL, credentials) {
    this.baseURL = baseURL;
    this.credentials = credentials;
    this.client = axios.create({
      baseURL,
      timeout: 10000,
    });
  }

  async get(endpoint, options = {}) {
    return this.client.get(endpoint, {
      auth: this.credentials,
      ...options,
    });
  }

  async post(endpoint, data, options = {}) {
    return this.client.post(endpoint, data, {
      auth: this.credentials,
      ...options,
    });
  }
}

module.exports = APIClient;
```

## Pull Request Process

### 1. Create Feature Branch
```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes
- Write clean, commented code
- Add/update tests
- Update documentation
- Add examples

### 3. Commit Messages
Use clear, descriptive messages:
```
feat: add testRailLink extraction from Jira
fix: correct CSV header parsing for special chars
docs: update user management tool documentation
refactor: extract common API logic to lib/api-client.js
```

### 4. Push & Create PR
```bash
git push origin feature/your-feature-name
```

Create pull request with:
- Clear title and description
- Reference related issues
- List changes made
- Include examples if applicable

### 5. Code Review
- Address feedback
- Make requested changes
- Update PR if needed

## Testing

### Manual Testing
1. Test with real data (safe first)
2. Test edge cases
3. Test error handling
4. Verify CSV files work
5. Check console output

### Test Checklist
- [ ] Tool runs without errors
- [ ] CSV processing works correctly
- [ ] API calls are successful
- [ ] Error messages are clear
- [ ] Results are accurate
- [ ] No data loss or corruption

### Example Test Data
Create test CSVs in tool folders:
```
src/tools/<category>/test-data/
├── input-valid.csv
├── input-invalid.csv
└── expected-output.csv
```

## Documentation Standards

### Tool-Specific README
```markdown
# Tool Name

Description

## Prerequisites
- List requirements
- API keys needed
- Environment setup

## Usage
npm run command [options]

## Input Format
| Column | Description | Required |
|--------|-------------|----------|
| col1   | Description | Yes      |

## Output Format
- Description of output

## Examples

### Example 1
Step-by-step walkthrough

## Error Handling
How tool handles errors

## Notes
- Important information
- Limitations
- Tips
```

## Environment Variables

### Add New Variables
1. Document in `.env.example`
2. Add to `src/config.js` if shared
3. Update `docs/SETUP.md`
4. Add type hints in comments

```env
# New tool configuration
NEW_TOOL_API_URL=https://api.example.com
NEW_TOOL_API_KEY=your-api-key
NEW_TOOL_TIMEOUT=5000  # milliseconds
```

## Best Practices

### Error Handling
```javascript
try {
  // Attempt operation
  const result = await operation();
  return result;
} catch (error) {
  console.error('Operation failed:', error.message);
  // Log full error for debugging
  console.debug(error.stack);
  throw new Error(`Failed to...: ${error.message}`);
}
```

### CSV Processing
```javascript
// Always validate CSV
const validateCSV = (headers, requiredFields) => {
  const missing = requiredFields.filter(f => !headers.includes(f));
  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`);
  }
};
```

### API Rate Limiting
```javascript
// Add delays to avoid rate limits
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

for (const item of items) {
  await processItem(item);
  await delay(500);  // 500ms between calls
}
```

### Logging
```javascript
console.log(`[${i + 1}/${total}] Processing ${item.id}...`);
console.log(`  ✓ Success`);
console.error(`  ✗ Error: ${error.message}`);
```

## Common Mistakes to Avoid

1. ❌ Hardcoding credentials → ✅ Use `.env` variables
2. ❌ No error handling → ✅ Try-catch with meaningful messages
3. ❌ No progress indication → ✅ Log [X/Y] counters
4. ❌ Poor variable names → ✅ Use descriptive names
5. ❌ Missing documentation → ✅ Add comments and docs
6. ❌ CSV not validated → ✅ Check headers first
7. ❌ No rate limiting → ✅ Add delays between API calls

## Getting Help

1. Check existing tool implementations
2. Review `docs/TOOLS.md`
3. Look at `src/lib/` for utilities
4. Ask QA team lead
5. Check ESLint/code quality suggestions

## Reporting Issues

When reporting bugs:
1. Describe the issue clearly
2. Include error messages
3. Provide input data (sanitized)
4. List steps to reproduce
5. Mention environment (node version, OS)

## Recognition

Contributors are recognized in:
- CONTRIBUTORS.md file
- Tool documentation
- Commit history

Thank you for improving QA Member Tools!
