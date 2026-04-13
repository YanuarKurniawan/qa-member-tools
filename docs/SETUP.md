# Setup Guide

## Prerequisites

- **Node.js**: v14 or higher
  ```bash
  node --version  # Should be v14+
  ```

- **npm**: v6 or higher
  ```bash
  npm --version  # Should be v6+
  ```

## Installation

### 1. Clone the Repository
```bash
git clone <repo-url>
cd qa-member-tools
```

### 2. Install Dependencies
```bash
npm install
```

This will install all required packages:
- `axios` - HTTP client for API calls
- `csv-parser` - CSV file parsing
- `dotenv` - Environment variable management

### 3. Configure Environment Variables

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` with your actual credentials:
```bash
# Required for Jira tools
JIRA_BASE_URL=https://your-jira.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-personal-api-token

# Required for UNM tools
UNM_BASE_URL=https://unm-api.your-company.com
UNM_API_KEY=your-unm-api-key

# Required for Member Services
MEMBER_SERVICE_BASE_URL=https://member-api.your-company.com
MEMBER_SERVICE_API_KEY=your-member-api-key

# Optional: For TestRail operations
TESTRAIL_BASE_URL=https://your-testrail.testrail.com
TESTRAIL_API_KEY=your-testrail-api-key
```

### 4. Verify Installation
```bash
# List all available commands
npm run

# Test a specific tool (example)
npm run batch-register --help
```

## Obtaining API Credentials

### Jira API Token
1. Go to https://id.atlassian.com/manage/api-tokens
2. Create new API token
3. Copy the token to `.env` as `JIRA_API_TOKEN`
4. Your email is the `JIRA_EMAIL`

### TestRail API Key
1. Log in to TestRail
2. Go to Administration > API
3. Find your API key in the user profile
4. Copy to `.env` as `TESTRAIL_API_KEY`

### Other APIs
Contact your system administrator for:
- UNM API credentials
- Member Service API credentials
- Other third-party service credentials

## Running Tools

### Using npm scripts
```bash
# User management tools
npm run batch-register
npm run set-password
npm run upgrade-tier

# Jira tools
npm run jira:get-testrail-link input.csv

# TestRail tools
npm run testrail:update-case

# Performance testing
npm run lighthouse:run
```

### Direct execution
```bash
node src/tools/user-management/batch-register.js
node src/tools/jira/getTestRailLink.js input.csv
```

## Project Structure

After installation, your project will have:

```
qa-member-tools/
├── src/
│   ├── tools/              # All automation tools
│   │   ├── user-management/
│   │   ├── user-auth/
│   │   ├── jira/
│   │   ├── testing/
│   │   └── performance/
│   ├── lib/                # Shared utilities
│   └── config/             # Configuration files
├── docs/                   # Documentation
├── .env                    # Environment variables (gitignored)
├── .env.example           # Template for .env
├── package.json           # Dependencies and scripts
└── README.md              # Main documentation
```

## Common Issues

### ❌ "Cannot find module 'dotenv'"
**Solution:**
```bash
npm install
```

### ❌ "ENOENT: no such file or directory, .env"
**Solution:**
```bash
cp .env.example .env
# Edit .env with your credentials
```

### ❌ "API Authentication failed"
**Solution:**
- Verify API tokens in `.env` are correct
- Check API token hasn't expired
- Confirm user has necessary permissions in Jira/TestRail

### ❌ "CSV file not found"
**Solution:**
- Verify CSV file exists in the correct directory
- Check file path and name match exactly
- Ensure proper CSV format

## Updating Tools

To update dependencies:
```bash
npm update
```

## Best Practices

1. **Always backup data** before running batch operations
2. **Test with small dataset** before processing entire datasets
3. **Keep `.env` secure** - never commit it to version control
4. **Review CSV files** before processing
5. **Check logs** for errors and warnings
6. **Use version control** for your work

## Next Steps

1. Read [Tools Documentation](./tools.md) for detailed tool information
2. Review specific tool documentation in `src/tools/*/README.md`
3. Check [Contributing Guidelines](./CONTRIBUTING.md)
4. Contact the QA team for support

## Support

If you encounter issues:
1. Check the troubleshooting section in main README
2. Review tool-specific documentation
3. Check `.env` configuration
4. Contact QA team lead
