# QA Member Tools

A comprehensive suite of automation tools for user management, testing, and QA operations.

## 🚀 Quick Start

### Requirements
- Node.js v14+
- npm v6+

### Setup (5 minutes)
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your API credentials

# 3. Verify setup
npm run --list
```

See [Setup Guide](./docs/SETUP.md) for detailed instructions.

## 📦 What's Included

### User Management
- **Batch Register** - Register users in bulk from CSV
- **Set Password** - Reset passwords in preprod
- **Upgrade Tier** - Bulk tier upgrades for users
- **SNW Claim** - Special New User claim management

### User Authentication
- **Copy Role Privilege** - Replicate user roles/permissions
- **Delete Email** - Remove user email from systems

### Jira Integration
- **Get TestRail Link** - Extract TestRail URLs from Jira descriptions
- **Create Report** - Generate reports from Jira issues
- **Update Parent** - Update parent issue relationships
- **Dynamic Transition** - Transition issues through workflows

### Testing Tools
- **TestRail Integration** - Manage test cases and sections
- **Google Sheets** - Sheet data operations

### Performance Testing
- **K6 Load Testing** - Run load tests and performance evaluations
- **Lighthouse** - Run audits for performance, accessibility, SEO

## 📋 Common Commands

```bash
# User Management
npm run batch-register
npm run set-password
npm run upgrade-tier

# Jira Tools
npm run jira:get-testrail-link input.csv

# Jira Workflow
npm run jira:create-report
npm run jira:update-parent

# Authentication
npm run copy-role-privilege <source@email> <target@email>
npm run delete-email

# Performance
npm run lighthouse:run
npm run k6:run
```

## 📁 Project Structure

```
qa-member-tools/
├── src/
│   ├── tools/
│   │   ├── user-management/    # User registration & account tools
│   │   ├── user-auth/          # Authentication & authorization
│   │   ├── jira/               # Jira API integrations
│   │   ├── testing/            # TestRail, Sheets
│   │   └── performance/        # K6, Lighthouse
│   └── lib/                    # Shared utilities
├── docs/
│   ├── README.md              # Full documentation
│   ├── SETUP.md               # Setup instructions
│   ├── TOOLS.md               # Tool-specific docs
│   └── CONTRIBUTING.md        # Contributing guidelines
├── .env.example               # Configuration template
└── package.json               # Dependencies & scripts
```

## 🔧 Configuration

Rename `.env.example` to `.env` and fill in your credentials:

```env
# Jira
JIRA_BASE_URL=https://your-jira.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-personal-token

# UNM & Member Services
UNM_BASE_URL=https://unm-api.company.com
UNM_API_KEY=your-key
MEMBER_SERVICE_BASE_URL=https://member-api.company.com
MEMBER_SERVICE_API_KEY=your-key

# TestRail
TESTRAIL_BASE_URL=https://your-testrail.testrail.com
TESTRAIL_API_KEY=your-key
```

## 📚 Documentation

- **[Setup Guide](./docs/SETUP.md)** - Installation and configuration
- **[Tools Reference](./docs/TOOLS.md)** - Detailed tool documentation
- **[Contributing](./docs/CONTRIBUTING.md)** - Contributing guidelines
- **[Full README](./docs/README.md)** - Complete project documentation

## 💡 Examples

### Extract TestRail Links from Jira
```bash
npm run jira:get-testrail-link issues.csv output.csv
```

### Bulk Register Users
```bash
npm run batch-register
# Ensure register.csv is in correct format first
```

### Copy User Privileges
```bash
npm run copy-role-privilege admin@company.com newuser@company.com
```

## ⚠️ Important Notes

1. **Always backup data** before running bulk operations
2. **Test with small datasets** first
3. **Never commit `.env`** to version control
4. **Verify CSV files** before processing
5. **Check logs** for errors and warnings

## 🐛 Troubleshooting

### Setup Issues
See [Troubleshooting Section](./docs/SETUP.md#common-issues)

### Tool-Specific Issues
See [Tools Documentation](./docs/TOOLS.md#troubleshooting)

### API Problems
- Verify `.env` variables are correct
- Check API tokens haven't expired
- Ensure proper user permissions

## 🤝 Contributing

We welcome contributions! Please:

1. Read [Contributing Guidelines](./docs/CONTRIBUTING.md)
2. Follow code standards
3. Add documentation
4. Create pull request with clear description

## 📞 Support

- **Issues**: Check troubleshooting guides
- **Questions**: Contact QA team lead
- **New Tools**: See contributing guidelines

## 📝 License

MIT

---

**Last Updated**: February 2026  
**Version**: 1.0.0  
**Maintained by**: QA Team
