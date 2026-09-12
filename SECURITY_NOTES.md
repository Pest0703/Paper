# Privacy and security development notes

PaperTutor does not commit user documents, runtime state, API credentials, private test paths, screenshots, logs, Electron profiles, or user-specific service endpoints.

Private integration tests receive files, endpoints, and credentials through environment variables or command-line arguments. Repository reports use anonymous fixture names and sanitized outputs. Run `npm run privacy:check` before committing and `npm run privacy:history` before publishing rewritten history.

Install the local lightweight pre-commit hook with:

```powershell
npm run hooks:install
```
