# AgentActivity

A local-only Windows app that shows your Claude Code usage and what your agents are doing in real time.

- Reads Claude Code's own local session logs for exact recorded token usage and cost (no estimates, no API key).
- Optional live tracking: Claude Code hooks post events to `http://127.0.0.1:47615` (loopback only), so you can see
  the main agent, subagents, current tool calls and permission prompts as they happen.
- No database and no network access; data stays on your machine.

## Download

Grab the latest `AgentActivity-v<version>-win-x64.zip` from the [Releases](../../releases) page, unzip, and run
`AgentActivity.exe`.

## Develop

```
npm ci
npm run dev        # run with hot reload
npm run package    # build release/AgentActivity/AgentActivity.exe
```

## Release

Every push to `main` runs the `Release` workflow: it builds the exe and publishes a new release under Releases.
The version is `major.minor` from `package.json` plus the run number (e.g. `v0.1.7`); edit `version` in
`package.json` to bump major/minor. Docs-only (`*.md`) pushes are skipped.
