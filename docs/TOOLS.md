# Tools Documentation

Detailed documentation for each tool in the QA Member Tools suite.

## User Management Tools

### 1. Batch Register (`batch-register.js`)

Register users to UNM in batch mode, mimicking FE registration flow.

**Usage:**
```bash
npm run batch-register
```

**Input:** `register.csv` with columns:
- `email` - User email
- `password` - User password
- `firstName` - First name
- `lastName` - Last name
- `phone` - Phone number
- `tier` - User tier level

**Output:** 
- Success/failure status for each user
- Log file with results

**Notes:**
- Mimics FE registration process
- Verify CSV before execution
- Check API responses for errors

---

### 2. Batch Register GK (`batch-register-gk.js`)

Alternative batch registration implementation.

**Usage:**
```bash
npm run batch-register-gk
```

**Differences from standard batch-register:**
- Different API endpoints
- Different field requirements
- Check tool-specific documentation

---

### 3. Set Password (`set-password.js`)

Reset passwords for users in preprod environment.

**Usage:**
```bash
npm run set-password
```

**Input:** CSV file with columns:
- `email` - User email
- `newPassword` - New password to set

**Pre-requisites:**
1. Delete UNM IDs first
2. Backup deleted IDs somewhere safe
3. Ensure users exist in Member Services

**Post-execution:**
- Restore unmUserIds to database manually
- Verify passwords were set correctly

**⚠️ Important:**
- Only for preprod environment
- Do NOT run on production
- Always backup user IDs first

---

### 4. Upgrade Tier (`upgrade-tier.js`)

Upgrade user tier for multiple users in batch.

**Usage:**
```bash
npm run upgrade-tier
```

**Input:** CSV with columns:
- `accountId` - User account ID
- `newTier` - Target tier level

**Output:**
- Updated user information
- Status per user

**Supported Tiers:**
- Basic
- Premium
- Enterprise
- VIP

---

### 5. SNW Claim (`snw-claim.js`)

Manage SNW (Special New User) claims for users.

**Usage:**
```bash
npm run snw-claim
```

**Features:**
- Claim SNW status
- Release SNW claims
- Check claim status

---

## User Authentication Tools

### 1. Copy Role Privilege

Copy role privileges from source user to target user.

**Production:**
```bash
npm run copy-role-privilege <source@email.com> <target@email.com>
```

**Preprod:**
```bash
npm run copy-role-privilege-preprod <source@email.com> <target@email.com>
```

**What it copies:**
- All roles
- All permissions
- All custom privileges
- Team assignments (optional)

**Example:**
```bash
npm run copy-role-privilege admin@company.com newuser@company.com
```

---

### 2. Delete Email

Remove email from UNM and Member Services.

**Production:**
```bash
npm run delete-email
```

**Preprod:**
```bash
npm run delete-email-preprod
```

**Workflow:**
1. Tool prompts for email address
2. Fetches user data
3. Confirms deletion
4. Deletes from UNM
5. Deletes from Member Services
6. Shows results

**Caution:**
- This is permanent
- User cannot log in after deletion
- Backup user data if needed

---

## Jira Tools

### 1. Get TestRail Link (`getTestRailLink.js`)

Extract TestRail case links from Jira issue descriptions.

**Usage:**
```bash
npm run jira:get-testrail-link <input.csv> [output.csv]
```

**Input CSV columns:**
- `issueKey` or `jiraId` - Jira issue key (e.g., QAAUT-22758)

**Output CSV:**
- All input columns
- `testRailLink` - Extracted TestRail URL

**Example:**
```bash
npm run jira:get-testrail-link issues.csv results.csv
```

**Output format:**
```csv
issueKey,testRailLink
QAAUT-22758,https://tiket.testrail.com/index.php?/cases/view/1194574
QAAUT-22759,https://tiket.testrail.com/index.php?/cases/view/1194575
```

**How it works:**
1. Reads issue keys from CSV
2. Fetches Jira issue details via API
3. Searches description for TestRail links
4. Extracts and formats URLs
5. Writes to output CSV

**Notes:**
- Requires valid Jira API credentials
- Includes rate-limiting delays (500ms)
- Shows progress with [X/Y] counter
- Handles errors gracefully

---

### 2. Create Report (`createReport.js`)

Generate reports from Jira issues.

**Usage:**
```bash
npm run jira:create-report
```

**Features:**
- Filter by status, assignee, labels
- Export to CSV/JSON
- Aggregate statistics
- Custom date ranges

---

### 3. Update Parent (`updateParent.js`)

Update parent issue relationships.

**Usage:**
```bash
npm run jira:update-parent
```

**Input:**
- Child issue key
- New parent issue key

---

### 4. Dynamic Transition (`jiraDynamicTransition.js`)

Perform state transitions on Jira issues dynamically.

**Usage:**
```bash
npm run jira:dynamic-transition
```

**Features:**
- Transition multiple issues
- Custom workflow states
- Add comments during transition

---

## Testing Tools

### TestRail Integration

#### Add Section (`testrail/addSection.js`)
```bash
npm run testrail:add-section
```

#### Get Section ID (`testrail/getSectionId.js`)
```bash
npm run testrail:get-section-id
```

#### Update Case (`testrail/updateCase.js`)
```bash
npm run testrail:update-case
```

#### Update Section (`testrail/updateSection.js`)
```bash
npm run testrail:update-section
```

### Sheet Operations (`sheet/`)

Tools for Google Sheets operations and data management.

---

## Test Runner

Web UI page for executing a TestRail run from one keyboard-driven table — draft statuses and comments locally, then push to TestRail when ready.

**Route:** `/test-runner` (enter a run ID or paste a TestRail run URL). `/test-runner/:runId` opens a specific run directly; the run ID is in the URL so a run is shareable and survives reload.

**Run list:** `/test-runner` lists every run that has been synced on this machine, newest first, with how far it has got in TestRail, when it was last synced, and how many unsaved drafts it is holding. Rows are links, so a run can be opened in a new tab. **All runs** at the top of a run returns here.

**Done:** clears a finished run off the list by deleting `server/data/testRuns/<runId>.json`. It asks first, and warns when the run still holds drafts, because those are discarded with it. Nothing is sent to TestRail: results already uploaded stay there, and entering the run ID again re-syncs the run from scratch.

**Credentials:** requires `TESTRAIL_USER` and `TESTRAIL_API_KEY` in `.env` (same as other TestRail tools).

**Sync:** pulls the run's tests from TestRail and refreshes the **Latest TestRail** column while preserving local drafts. If TestRail changed a field you also edited, the row is flagged as a conflict with **Keep mine** / **Take theirs** per field.

**Upload:** pushes only changed rows — status and comment drafts go to `add_results_for_cases` in bulk; name and priority edits go to `update_case`. **Name and priority edits change the shared case**, so they affect every run using that case. Statuses and comments affect **this run only**.

**Untested skip:** rows drafted back to Untested cannot be uploaded (TestRail cannot set a test back to Untested); they are reported as skipped in the upload summary.

**Completed / archived runs:** TestRail rejects new results on completed or archived runs, so status and comment upload is blocked (banner shown, Upload disabled for results). Name and priority case edits are still allowed.

**Draft storage:** drafts are stored server-side per run at `server/data/testRuns/<runId>.json`, so they survive reload and are visible from any browser. Delete that file to discard drafts for a run.

**Required result fields:** every uploaded result carries the instance's required result-field defaults (on `tiket.testrail.com`, currently **`reusable = No`** unless an admin changes the field default in TestRail).

**Defects:** the case drawer has a Defects field under the comment box, taking one or more Jira keys (`PLAT-1234, PLAT-5678`). It is a result field, so it applies to this run only and never edits the shared case — unlike the case's own refs shown in the drawer header. Rows carrying a defect show a badge next to the status, and keys render as links to Jira. The defect uploads on the same result as the status and comment, so it costs no extra request.

TestRail refuses a result that carries only defects (it requires a status, comment, or assignee), so a defect added on its own restates the status the row already shows — the same result TestRail's own UI produces when you link a defect. A defect on an **Untested** row has no status to restate: it is not uploaded, the row is flagged with "Set a status or comment on this row before uploading its defect.", and the draft is kept so nothing is lost.

**Folders:** the Folder column shows the TestRail section a case lives in, and the dropdown in the filter bar narrows the table to one folder (with the case count next to each name). The column shows only the folder itself — hover it for the full path from the top of the suite down. The dropdown is hidden when every case in the run sits in the same folder.

`get_tests` does not report a case's section, so a sync resolves folders from `get_sections` and `get_cases` for the run's suite. Those two calls are treated as optional: if they fail, the sync still succeeds, the folder falls back to the value from the previous sync, and the column shows `—` when it was never known.

**Keyboard shortcuts:**

| Keys | Action |
|------|--------|
| `j` / `k` (or ↓ / ↑) | Move focused row |
| `p` / `f` / `b` / `r` | Set Passed / Failed / Blocked / Retest on focused row, then move to the next case |
| `Enter` | Open case detail drawer |
| `/` | Focus search |
| `?` | Show shortcut overlay |
| `Escape` | Close drawer or overlay |

Shortcuts are suppressed while a text input has focus.

**Advancing after a status:** setting a status (by shortcut, by the inline buttons, or from the drawer) moves to the next case, so a run can be executed straight down the list. The open drawer follows the focused row, including when moving with `j` / `k`, so the details on screen always match the row you are on. When a status filter is active the row leaves the list as soon as it is set, and the case that slides up into its place becomes the next one; passing the last remaining row empties the list and closes the drawer.

---

## Performance Testing Tools

### K6 Load Testing

Run load tests using K6 framework.

**Setup:**
```bash
# Install K6
brew install k6  # macOS
# or download from https://k6.io

npm run k6:run
npm run k6:test
```

**Test file:** `src/tools/performance/k6/test.js`

- Define virtual users (VUs)
- Set test duration
- Configure thresholds
- Define test scenarios

---

### Lighthouse Audits

Run Lighthouse performance and SEO audits.

**Usage:**
```bash
npm run lighthouse:run
```

**Tests:**
- Performance
- Accessibility
- Best Practices
- SEO
- PWA

**Output:**
- HTML report
- JSON data
- Performance metrics

---

## Tips & Best Practices

### CSV Handling
1. Always verify CSV before running
2. Use tools to open CSVs (Excel, Google Sheets)
3. Check for special characters
4. Ensure proper encoding (UTF-8)
5. Backup original CSV

### Error Handling
1. Check logs for detailed error messages
2. Verify API credentials
3. Check network connectivity
4. Ensure proper CSV format
5. Review rate limiting

### Performance
1. Large datasets: Batch in chunks
2. API limits: Use built-in delays
3. Monitor resources: Check RAM/CPU
4. Log everything: For troubleshooting

### Security
1. Never commit `.env` file
2. Rotate API tokens regularly
3. Use separate credentials for prod/preprod
4. Audit tool usage
5. Backup sensitive data

---

## Troubleshooting

### Common Issues

**"Cannot read property 'description' of undefined"**
- Issue doesn't exist in Jira
- API token might be invalid
- Check issue key spelling

**"Rate limit exceeded"**
- Add delays between calls
- Reduce batch size
- Contact API provider

**"CSV encoding error"**
- Save CSV as UTF-8
- Remove special characters
- Try opening in different application

**"Connection timeout"**
- Check API endpoint URL
- Verify network connectivity
- Check firewall rules

---

## Support & Contact

For detailed help with specific tools:
1. Check tool-specific README in `src/tools/*/README.md`
2. Review this documentation
3. Contact QA team lead
4. Check tool source code for implementation details
