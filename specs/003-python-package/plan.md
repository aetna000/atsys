# Plan

Bundle Node server entries/dependencies with esbuild and UI assets with Vite at release-build time. Distribute these as Python package data; depend on nodejs-wheel-binaries for the Node 24 runtime. A small standard-library Python CLI locates package resources, launches the bundled backend, chooses persistent user data, and provides init/integrate/ui/task-template commands. No runtime npm downloads or source-checkout dependencies.

Centralize server paths for source and packaged execution. Service and subprocess entry paths resolve relative to the bundle. HTTP health identifies the data workspace so dashboard startup cannot silently connect to a different instance. Install a packaged Codex skill per repository, preserving unrelated files, with task configuration reference and recursion guard.

Constitution: preserve source and credentials, deterministic authority, bounded recovery, independently validated checks. Source distribution carries prebuilt runtime assets; wheel build fails clearly if those are missing. Test installed wheel from isolated workspaces, including real command execution, dashboard assets, integration idempotence/conflicts, and service argument resolution. Existing runtime regression tests continue to gate the build.

Post-implementation constitution check: the package preserves project source and credentials; instance identity keeps user state separate; recovery authority is unchanged. Installed-wheel checks exercise independent validation and real OS recovery. The packaged skill prevents recursion and requires actual handoff evidence. Registry publication and Linux OS-service implementation remain explicit follow-up work.
