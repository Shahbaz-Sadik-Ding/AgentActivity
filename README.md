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

Push a version tag; the `Release` workflow builds the exe and publishes it under Releases:

```
git tag v0.2.0
git push origin v0.2.0
```

The workflow can also be started manually from the Actions tab with a version number.
