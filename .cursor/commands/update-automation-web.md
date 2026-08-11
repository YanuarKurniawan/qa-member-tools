# Update Automation WEB dashboard

Refresh the **Automation WEB** reconciliation dashboard (`/automation-web`) by re-pulling the
three counts and rewriting `server/data/automationWeb.json` with a new "Last Data Update".

(There is also a **Refresh** button on the page itself; it refreshes Sheets + TestRail live, and
Jira too if `JIRA_API_TOKEN` is set. Use this command when there is no Jira token so Jira can be
pulled via the Atlassian MCP.)

Follow the `update-automation-web` skill:

1. If `.env` has no `JIRA_API_TOKEN`, get the Jira counts via the Atlassian MCP
   (cloudId `4b56b3a8-6af3-464f-9273-7c947772bd43`):
   - Scope: `parent = QAAUT-30177 AND "Story Type" = "New Feature" AND labels = "P0" AND status NOT IN ("Invalid", "Dropped")`
   - Done: the scope above `AND status = Done`
   - Total: the scope above
2. Run the refresh:
   ```bash
   node scripts/refreshAutomationWeb.js --jira-done=<DONE> --jira-total=<TOTAL>
   ```
   (or just `node scripts/refreshAutomationWeb.js` if a Jira token is configured).
3. Report the three counts (Google Sheet `ShouldRun=y`, Jira `Done`, TestRail `Automation Yes + Done`),
   whether they match, and the spread.
