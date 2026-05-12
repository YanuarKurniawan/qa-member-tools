module.exports = [
  // ─── User Management ────────────────────────────────────────────
  {
    id: 'batch-register',
    name: 'Batch Register',
    category: 'user-management',
    description: 'Register multiple users from CSV file (Sandbox environment)',
    service: 'user-management/batchRegister',
    input: {
      type: 'csv',
      csvInfo: 'CSV columns: Name, Email, phoneCode, phoneNumber, Level',
      csvExample: 'Name,Email,phoneCode,phoneNumber,Level\nJohn Doe,john@test.com,62,81234567890,BASIC',
    },
    output: { hasLogs: true, hasResults: true },
  },
  {
    id: 'batch-register-gk',
    name: 'Batch Register (GK)',
    category: 'user-management',
    description: 'Register multiple users from CSV file (GK environment)',
    service: 'user-management/batchRegisterGk',
    input: {
      type: 'csv',
      csvInfo: 'CSV columns: Name, Email, phoneCode, phoneNumber, Level',
      csvExample: 'Name,Email,phoneCode,phoneNumber,Level\nJohn Doe,john@test.com,62,81234567890,BASIC',
    },
    output: { hasLogs: true, hasResults: true },
  },
  {
    id: 'set-password',
    name: 'Set Password',
    category: 'user-management',
    description: 'Batch reset passwords for users from CSV file',
    service: 'user-management/setPassword',
    input: {
      type: 'csv',
      csvInfo: 'CSV columns: accountId, phoneCode, phoneNumber, password',
      csvExample: 'accountId,phoneCode,phoneNumber,password\n12345,62,81234567890,NewPassword123',
    },
    output: { hasLogs: true, hasResults: true },
  },
  {
    id: 'upgrade-tier',
    name: 'Upgrade Tier',
    category: 'user-management',
    description: 'Batch upgrade user tiers from CSV file',
    service: 'user-management/upgradeTier',
    input: {
      type: 'csv',
      csvInfo: 'CSV columns: accountId, Level',
      csvExample: 'accountId,Level\n12345,GOLD\n67890,PLATINUM',
    },
    output: { hasLogs: true, hasResults: true },
  },
  {
    id: 'inject-profile',
    name: 'Inject Profile',
    category: 'user-management',
    description: 'Bulk inject passenger profiles to an account (randomized names)',
    service: 'user-management/injectProfile',
    input: {
      type: 'form',
      fields: [
        { name: 'accountId', label: 'Account ID', type: 'text', placeholder: '31058290', required: true },
        { name: 'count', label: 'Number of Profiles', type: 'number', placeholder: '10', required: true },
        {
          name: 'env',
          label: 'Environment',
          type: 'select',
          options: [
            { value: 'test', label: 'Staging (test)' },
            { value: 'preprod', label: 'Pre-production' },
          ],
          required: true,
        },
      ],
    },
    output: { hasLogs: true, hasResults: true },
  },

  // ─── User Auth ──────────────────────────────────────────────────
  {
    id: 'copy-role',
    name: 'Copy Role & Privilege',
    category: 'user-auth',
    description: 'Copy roles and privileges from one account to another',
    service: 'user-auth/copyRolePrivilege',
    input: {
      type: 'form',
      fields: [
        { name: 'sourceEmail', label: 'Source Email', type: 'email', placeholder: 'source@example.com', required: true },
        { name: 'targetEmail', label: 'Target Email', type: 'email', placeholder: 'target@example.com', required: true },
        {
          name: 'env',
          label: 'Environment',
          type: 'select',
          options: [
            { value: 'test', label: 'Test' },
            { value: 'preprod', label: 'Pre-production' },
          ],
          required: true,
        },
      ],
    },
    output: { hasLogs: true, hasResults: true },
  },
  {
    id: 'delete-email',
    name: 'Delete Email',
    category: 'user-auth',
    description: 'Remove email from a user account (preview first, then confirm)',
    service: 'user-auth/deleteEmail',
    input: {
      type: 'form',
      fields: [
        { name: 'email', label: 'Email to Delete', type: 'email', placeholder: 'user@example.com', required: true },
        {
          name: 'env',
          label: 'Environment',
          type: 'select',
          options: [
            { value: 'test', label: 'Test' },
            { value: 'preprod', label: 'Pre-production' },
          ],
          required: true,
        },
      ],
    },
    output: { hasLogs: true, hasResults: true, hasConfirmStep: true },
  },
  {
    id: 'get-account-id',
    name: 'Get Account ID',
    category: 'user-auth',
    description: 'Fetch account IDs from emails and add them to CSV',
    service: 'user-auth/getAccountId',
    input: {
      type: 'csv',
      csvInfo: 'CSV columns: email (case-insensitive, "Email" or "email")',
      csvExample: 'email\nuser1@example.com\nuser2@example.com',
      extraFields: [
        {
          name: 'env',
          label: 'Environment',
          type: 'select',
          options: [
            { value: 'test', label: 'Test' },
            { value: 'preprod', label: 'Pre-production' },
          ],
          required: true,
        },
        {
          name: 'memberType',
          label: 'Member Type',
          type: 'select',
          options: [
            { value: 'B2C', label: 'B2C' },
            { value: 'ADMIN', label: 'ADMIN' },
          ],
          required: false,
          defaultValue: 'B2C',
        },
      ],
    },
    output: { hasLogs: true, hasResults: true },
  },

  // ─── Jira & TestRail ───────────────────────────────────────────
  {
    id: 'get-testrail-link',
    name: 'Get TestRail Links',
    category: 'jira',
    description: 'Extract TestRail case links from Jira issue descriptions',
    service: 'jira/getTestrailLink',
    input: {
      type: 'csv',
      csvInfo: 'CSV columns: issueKey (or jiraId)',
      csvExample: 'issueKey\nPROJ-123\nPROJ-456',
    },
    output: { hasLogs: true, hasResults: true },
  },
  {
    id: 'update-parent',
    name: 'Update Parent',
    category: 'jira',
    description: 'Bulk update parent issue for Jira issues from CSV',
    service: 'jira/updateParent',
    input: {
      type: 'csv',
      csvInfo: 'CSV columns: issueKey, parentId',
      csvExample: 'issueKey,parentId\nPROJ-123,PROJ-100\nPROJ-456,PROJ-100',
      extraFields: [
        { name: 'dryRun', label: 'Dry Run', type: 'checkbox', description: 'Preview changes without applying' },
      ],
    },
    output: { hasLogs: true, hasResults: true },
  },
  {
    id: 'dynamic-transition',
    name: 'Dynamic Transition',
    category: 'jira',
    description: 'Move Jira issues through workflow states (To Do → In Progress → In Review → Done)',
    service: 'jira/dynamicTransition',
    input: {
      type: 'csv',
      csvInfo: 'CSV columns: issueKey, targetTransitionName',
      csvExample: 'issueKey,targetTransitionName\nPROJ-123,Done\nPROJ-456,In Review',
      extraFields: [
        { name: 'dryRun', label: 'Dry Run', type: 'checkbox', description: 'Preview changes without applying' },
      ],
    },
    output: { hasLogs: true, hasResults: true },
  },
  {
    id: 'create-report',
    name: 'TestRail Report',
    category: 'jira',
    description: 'Generate executed test case count from TestRail runs',
    service: 'jira/createReport',
    input: {
      type: 'form',
      fields: [
        { name: 'projectId', label: 'Project ID', type: 'number', placeholder: '184', required: true },
        { name: 'runStart', label: 'Run Start Date', type: 'date', required: true },
        { name: 'runEnd', label: 'Run End Date', type: 'date', required: true },
        { name: 'execStart', label: 'Execution Start Date', type: 'date', required: true },
        { name: 'execEnd', label: 'Execution End Date', type: 'date', required: true },
      ],
    },
    output: { hasLogs: true, hasResults: true },
  },

  // ─── Testing ────────────────────────────────────────────────────
  {
    id: 'testrail-add-section',
    name: 'Add Section',
    category: 'testing',
    description: 'Add test sections to TestRail from CSV',
    service: 'testing/testrailAddSection',
    input: {
      type: 'csv',
      csvInfo: 'CSV columns: foldername, endpoint',
      csvExample: 'foldername,endpoint\nLogin Tests,/api/v1/login\nRegister Tests,/api/v1/register',
      extraFields: [
        { name: 'projectId', label: 'Project ID', type: 'number', placeholder: '162', required: true },
        { name: 'parentId', label: 'Parent Section ID', type: 'number', placeholder: '101306', required: true },
        { name: 'suiteId', label: 'Suite ID', type: 'number', placeholder: '4710', required: true },
      ],
    },
    output: { hasLogs: true, hasResults: true },
  },
  {
    id: 'testrail-get-section-id',
    name: 'Get Section IDs',
    category: 'testing',
    description: 'Retrieve section IDs from TestRail by parent ID',
    service: 'testing/testrailGetSectionId',
    input: {
      type: 'form',
      fields: [
        { name: 'projectId', label: 'Project ID', type: 'number', placeholder: '162', required: true },
        { name: 'suiteId', label: 'Suite ID', type: 'number', placeholder: '4710', required: true },
        { name: 'parentId', label: 'Parent Section ID', type: 'number', placeholder: '101306', required: true },
      ],
    },
    output: { hasLogs: true, hasResults: true },
  },
  {
    id: 'testrail-update-case',
    name: 'Update Cases',
    category: 'testing',
    description: 'Bulk update TestRail case preconditions and expected results',
    service: 'testing/testrailUpdateCase',
    input: {
      type: 'csv',
      csvInfo: 'CSV columns: ID, Precond, Results',
      csvExample: 'ID,Precond,Results\nC12345,User is logged in,Success message shown',
    },
    output: { hasLogs: true, hasResults: true },
  },
  {
    id: 'testrail-update-section',
    name: 'Update Sections',
    category: 'testing',
    description: 'Bulk update TestRail section names from CSV',
    service: 'testing/testrailUpdateSection',
    input: {
      type: 'csv',
      csvInfo: 'CSV columns: id, name',
      csvExample: 'id,name\n12345,Updated Section Name',
    },
    output: { hasLogs: true, hasResults: true },
  },
  {
    id: 'curl-call',
    name: 'Curl Call',
    category: 'testing',
    description: 'Execute curl commands from CSV and collect responses',
    service: 'testing/curlCall',
    input: {
      type: 'csv',
      csvInfo: 'CSV columns: Steps (containing curl commands)',
      csvExample: 'Steps\ncurl -X GET https://api.example.com/health',
    },
    output: { hasLogs: true, hasResults: true },
  },

  // ─── Database ───────────────────────────────────────────────────
  {
    id: 'update-account-id',
    name: 'Update Account ID',
    category: 'database',
    description: 'Update a single account ID across member tables',
    service: 'database/updateAccountId',
    input: {
      type: 'form',
      fields: [
        { name: 'oldAccountId', label: 'Old Account ID', type: 'text', placeholder: '12345', required: true },
        { name: 'newAccountId', label: 'New Account ID', type: 'text', placeholder: '67890', required: true },
        { name: 'dryRun', label: 'Dry Run', type: 'checkbox', description: 'Preview changes without applying' },
      ],
    },
    output: { hasLogs: true, hasResults: true },
  },
  {
    id: 'bulk-update-account-id',
    name: 'Bulk Update Account ID',
    category: 'database',
    description: 'Bulk update account IDs from CSV file',
    service: 'database/bulkUpdateAccountId',
    input: {
      type: 'csv',
      csvInfo: 'CSV columns: accountId, newAccountId',
      csvExample: 'accountId,newAccountId\n12345,67890\n11111,22222',
      extraFields: [
        { name: 'dryRun', label: 'Dry Run', type: 'checkbox', description: 'Preview changes without applying' },
      ],
    },
    output: { hasLogs: true, hasResults: true },
  },
];
