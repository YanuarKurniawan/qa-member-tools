import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import DOMPurify from 'dompurify';
import StatusCell from './StatusCell';

const JIRA_BASE = 'https://borobudur.atlassian.net';

function CaseHtml({ html }) {
  if (!html) return null;
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  return (
    <div
      className="max-w-none text-sm text-gray-700 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

function parseRefs(refs) {
  if (!refs) return [];
  return String(refs)
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
}

function jiraHref(key) {
  if (/^[A-Za-z]+-\d+$/.test(key)) {
    return `${JIRA_BASE}/browse/${key}`;
  }
  return null;
}

function Section({ label, children }) {
  if (!children) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function CaseDrawer({
  test,
  vocab,
  detail,
  loading,
  disabled,
  onClose,
  onPatch,
}) {
  const [commentLocal, setCommentLocal] = useState('');
  const [commentEditing, setCommentEditing] = useState(false);

  useEffect(() => {
    setCommentLocal('');
    setCommentEditing(false);
  }, [test.testId]);

  const commentValue = commentEditing ? commentLocal : test.comment || '';

  const commitComment = () => {
    const value = commentValue;
    const serverValue = test.comment || '';
    if (value === serverValue) {
      setCommentEditing(false);
      setCommentLocal('');
      return;
    }
    onPatch(test.testId, { comment: value || null });
  };

  const caseId = detail?.caseId ?? test.caseId;
  const refKeys = parseRefs(detail?.refs);

  return (
    <aside className="w-[440px] shrink-0 overflow-y-auto rounded-xl border border-gray-200 bg-white">
      <header className="sticky top-0 relative border-b border-gray-200 bg-white px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close case detail"
          className="absolute right-3 top-3 rounded p-1 text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <X size={16} />
        </button>
        <h2 className="pr-8 text-sm font-semibold text-gray-900">{test.title}</h2>
        <p className="mt-1 text-xs text-gray-500">
          <a
            href={`https://tiket.testrail.com/index.php?/cases/view/${caseId}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-blue-700 hover:underline"
          >
            C{caseId}
          </a>
          {refKeys.length > 0 && (
            <>
              {' · '}
              {refKeys.map((key, index) => {
                const href = jiraHref(key);
                return (
                  <span key={key}>
                    {index > 0 && ', '}
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-700 hover:underline"
                      >
                        {key}
                      </a>
                    ) : (
                      key
                    )}
                  </span>
                );
              })}
            </>
          )}
        </p>
      </header>

      <div className="space-y-5 px-5 py-4">
        {loading ? (
          <>
            <div className="h-16 animate-pulse rounded bg-gray-100" />
            <div className="h-24 animate-pulse rounded bg-gray-100" />
            <div className="h-20 animate-pulse rounded bg-gray-100" />
          </>
        ) : (
          <>
            {test.titleDivergedFromRun && detail?.runTitle && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                The case is renamed in TestRail. This run&apos;s view keeps the original title
                (&quot;{detail.runTitle}&quot;) until a new run is created.
              </div>
            )}

            {detail?.preconds && (
              <Section label="Preconditions">
                <CaseHtml html={detail.preconds} />
              </Section>
            )}

            {detail?.steps && (
              <Section label="Steps">
                <CaseHtml html={detail.steps} />
              </Section>
            )}

            {detail?.expected && (
              <Section label="Expected Result">
                <CaseHtml html={detail.expected} />
              </Section>
            )}

            <div className="space-y-3 border-t border-gray-100 pt-4">
              <StatusCell
                test={test}
                vocab={vocab}
                disabled={disabled}
                onPatch={onPatch}
              />
              <textarea
                rows={4}
                value={commentValue}
                disabled={disabled}
                onChange={(e) => {
                  setCommentEditing(true);
                  setCommentLocal(e.target.value);
                }}
                onBlur={commitComment}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setCommentLocal('');
                    setCommentEditing(false);
                    e.target.blur();
                  }
                }}
                placeholder="Add a comment…"
                className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
