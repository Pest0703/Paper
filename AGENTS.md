# PaperTutor Privacy Rules

1. Never commit a real API key, token, credential, or authorization header.
2. Never hard-code a user-specific API Workspace endpoint.
3. Never put a real Windows or macOS user-home path in source, tests, or reports.
4. Never commit paths from a user's personal desktop, document, download, or cloud-sync folders.
5. Never put the real filename or title of a private paper in tests or Markdown reports.
6. Pass every private test document through an environment variable or command-line argument.
7. PDF, DOC, and DOCX test assets are excluded from Git unless the user explicitly approves an open fixture.
8. Screenshots, logs, caches, Electron profiles, and runtime state are excluded from Git.
9. Reports use anonymous names such as `sample-paper.pdf` or `private-test-paper.docx`.
10. Run `npm run privacy:check` before every commit.
11. Codex-generated fixtures, reports, and tests follow the same rules.
12. If a possible secret or private identifier is found, stop pushing and sanitize it first.
13. Apply these rules regardless of repository visibility.
14. Treat every commit as potentially public.
15. Never commit Note databases, Note assets, user-authored Note content, or exported documents.

## Versioning

Every bug fix or feature change must increment the application version and update the visible version documentation. Never reuse a previously delivered version number.
