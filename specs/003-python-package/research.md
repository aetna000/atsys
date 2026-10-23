# Packaging decisions

- Retain the working TypeScript backend and React UI. Rewriting supervision in Python would duplicate a runtime already validated for crash/recovery behavior.
- Bundle JavaScript at release time with esbuild, including split shared chunks. Resolve every process entry point relative to the installed bundle. Avoid runtime npm install or a hard-coded checkout path.
- Use nodejs-wheel-binaries as an explicit Python dependency for Node 24. It is a third-party Node distribution; platform support follows its available wheels. Codex and project toolchains remain prerequisites.
- Package a repository Codex skill with the CLI so users supply an objective instead of copying infrastructure instructions. A task/role guard prevents recursive delegation.
- Keep persistent state outside the installation. Hash-based instance identity prevents silently connecting to a different local data workspace.
- Do not overwrite the sibling Python project or publish a registry release as part of local implementation.

References reviewed during implementation: [Codex skills](https://learn.chatgpt.com/docs/build-skills), [Node Python wrapper](https://pypi.org/project/nodejs-wheel/).
