const JIRA_BASE = 'https://borobudur.atlassian.net';

// TestRail stores both case refs and result defects as one comma-separated string.
export function parseKeys(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

// Anything that is not a Jira key is still a legitimate defect reference for TestRail,
// so it renders as plain text rather than being hidden or rejected.
export function jiraHref(key) {
  return /^[A-Za-z]+-\d+$/.test(key) ? `${JIRA_BASE}/browse/${key}` : null;
}
