# QA Member Tools

A collection of QA automation tools for user management, testing, and API interactions.

## 📋 Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Requirements](#requirements)
- [Setup](#setup)
- [Tools Documentation](#tools-documentation)
  - [User Management](#user-management)
  - [User Authentication](#user-authentication)
  - [Jira Tools](#jira-tools)
  - [Testing Tools](#testing-tools)
  - [Performance Testing](#performance-testing)
- [Contributing](#contributing)

## Overview

This project provides a suite of automation tools for:
- **User Management**: Batch registration, password reset, tier upgrades
- **Authentication**: Role privilege copying, email deletion
- **Jira Integration**: Report creation, parent issue updates, TestRail link extraction
- **Testing**: TestRail integration, Sheet operations
- **Performance**: K6 load testing, Lighthouse audits

## Project Structure

```
qa-member-tools/
├── src/
│   ├── tools/
│   │   ├── user-management/      # User registration and account management
│   │   ├── user-auth/            # Authentication and authorization tools
│   │   ├── jira/                 # Jira API integrations
│   │   ├── testing/              # Testing tools (TestRail, Sheet)
│   │   └── performance/          # Performance testing (K6, Lighthouse)
│   ├── lib/                      # Shared utilities and helpers
│   └── config/                   # Configuration templates
├── docs/                         # Documentation
├── .env.example                  # Environment variables template
├── package.json                  # Dependencies and npm scripts
└── README.md                     # This file
```

## Requirements

- **Node.js** (v14+)
- **npm** (v6+)
- **Environment variables** (see `.env.example`)

## Setup

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd qa-member-tools
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Verify setup**
   ```bash
   npm run --list
   ```

## Tools Documentation

### User Management

Tools for managing user accounts, registration, and tier upgrades.

#### Batch Register
Register users in UNM in batch mode, mimicking FE registration.
```bash
npm run batch-register
```
**Input**: `register.csv` (with user registration details)

#### Batch Register GK
Alternative batch registration tool.
```bash
npm run batch-register-gk
```

#### Set Password
Reset passwords for users in preprod environment.
```bash
npm run set-password
```
**Notes**:
- Ensure CSV is correct
- Delete UNM IDs first and backup
- Restore IDs to DB manually after success

#### Upgrade Tier
Upgrade user tier by account ID in batch.
```bash
npm run upgrade-tier
```

#### SNW Claim
SNW claim management tool.
```bash
npm run snw-claim
```

### User Authentication

Tools for managing user authentication and authorization.

#### Copy Role Privilege
Copy role and privileges from source to target user.
```bash
npm run copy-role-privilege <source@email.com> <target@email.com>
npm run copy-role-privilege-preprod <source@email.com> <target@email.com>
```

#### Delete Email
Delete email from UNM and member services.
```bash
npm run delete-email
npm run delete-email-preprod
```
Interactive tool that prompts for user email.

### Jira Tools

Integration with Jira API for issue management and reporting.

#### Get TestRail Link
Extract TestRail links from Jira issue descriptions.
```bash
npm run jira:get-testrail-link <input.csv>
```
**Output**: CSV with `testRailLink` column added

#### Create Report
Generate reports from Jira issues.
```bash
npm run jira:create-report
```

#### Update Parent
Update parent issues in Jira.
```bash
npm run jira:update-parent
```

#### Dynamic Transition
Perform dynamic state transitions on Jira issues.
```bash
npm run jira:dynamic-transition
```

### Testing Tools

#### TestRail Integration
- Add sections
- Get section IDs
- Update cases
- Update sections

```bash
npm run testrail:add-section
npm run testrail:get-section-id
npm run testrail:update-case
npm run testrail:update-section
```

#### Sheet Operations
Tools for Google Sheets or similar operations.

### Performance Testing

#### K6 Load Testing
Run load tests using K6.
```bash
npm run k6:run
npm run k6:test
```

#### Lighthouse Audits
Run Lighthouse performance audits.
```bash
npm run lighthouse:run
```

## Environment Variables

See `.env.example` for all available configuration options:

```
JIRA_BASE_URL          - Jira instance URL
JIRA_EMAIL             - Jira email for authentication
JIRA_API_TOKEN         - Jira API token
UNM_BASE_URL           - UNM API base URL
UNM_API_KEY            - UNM API key
MEMBER_SERVICE_BASE_URL - Member service API URL
MEMBER_SERVICE_API_KEY  - Member service API key
TESTRAIL_BASE_URL      - TestRail base URL
TESTRAIL_API_KEY       - TestRail API key
```

## Data Formats

### CSV Files
Most tools accept CSV input files. Always verify:
- Column names match expected format
- Data is clean and valid
- Backup original files before processing

### Common CSV Columns
- `issueKey` / `jiraId` - Jira issue identifier
- `email` - User email address
- `accountId` - User account identifier
- `tier` - User tier level

## Troubleshooting

### API Authentication Failed
- Verify `.env` variables are correct
- Check API tokens haven't expired
- Ensure user has proper permissions

### CSV Processing Issues
- Verify CSV file exists and path is correct
- Check CSV format (comma-separated, proper headers)
- Ensure no special characters in filenames

### Rate Limiting
- Tools include delays between API calls
- Adjust delays in source code if needed
- Consider batch size for large operations

## Contributing

When adding new tools:

1. Create appropriate subdirectory under `src/tools/`
2. Follow naming convention: `tool-name.js` (kebab-case)
3. Document usage in this README
4. Add npm script to `package.json`
5. Update `src/lib/` with any shared utilities
6. Create tool-specific README if complex

## License

MIT

## Support

For issues or questions, contact the QA team.
