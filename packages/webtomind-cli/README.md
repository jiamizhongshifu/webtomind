# webtomind-cli

Install WebToMind Skills into your coding agent.

```bash
npx webtomind-cli login
npx webtomind-cli install xhs-cover --agent codex
npx webtomind-cli list
npx webtomind-cli status
```

- `login` uses the OAuth 2.0 device authorization grant: approve the shown code
  in the browser. The credential (scope `skills:download`) is stored in the macOS
  Keychain or the Linux Secret Service; other systems fall back to a `0600`
  file in the user config directory.
- `install <slug> [--agent <name> | --target <dir>] [--version x.y.z] [--force]`
  downloads the archive from a short-lived signed URL, verifies its SHA-256 and
  only then extracts it. Agents: `claude-code` (default), `codex`, `cursor`,
  `gemini`, `kimi-code`, `antigravity`, `trae`.
- `list` shows Skills installed by this CLI; `list --available` shows the catalog.
- `logout` revokes the credential on the server and removes it locally.

Exit codes: `2` usage, `3` not logged in / credential invalid, `4` the Skill
needs Pro, lifetime access or a purchase, `5` integrity check failed.

`WEBTOMIND_API_URL` points the CLI at another deployment (https only, except
localhost).
