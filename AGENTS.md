# WebToMind development

- This public repository is the primary application source. Keep production
  secrets, customer data and third-party assets without redistribution rights
  out of commits and workflow output.
- Use Node.js from `.node-version` and the repository's pnpm version.
- Preserve unrelated local files. Run checks appropriate to the change.
- Follow `docs/PRODUCTION_RELEASE.md` for releases. Main pushes deploy only
  after CI passes and only when production auto-deploy is enabled.
- Production content is supplied by an authenticated hosted overlay. A source
  hash conflict requires reviewing and refreshing that overlay; do not disable
  the integrity guard or overwrite changed public source.
- UI changes require desktop and mobile browser verification, including the
  affected interactive states. Production changes require live acceptance.
- Report local checks, CI, deployment and live verification separately.
