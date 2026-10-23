# Quickstart validation

1. Use Node 24+ (minimum 22.16), then `npm install`.
2. `npm run dev`; open http://127.0.0.1:5173. The API binds 127.0.0.1:4310.
3. The initial workspace is explicitly marked Demo. Open Overview, Fleet and Runs. Search an agent and inspect its capability drawer.
4. Click New run. Choose project, provider label and objective, then start the simulation. It does not invoke a paid model.
5. Open the run. Inject a crash/stall/evaluation scenario, review evidence and decide the proposal. Reload and confirm the receipt persists.
6. Stop a run. Repeating stop must not add a second transition.
7. `npm test`, `npm run typecheck`, `npm run build`, `npm run test:e2e`.
8. `npm run atsys -- doctor` checks provider binaries without reading authentication. CLI help documents project attachment and explicit local argv execution.
9. Production: `npm run build && npm start`, then http://127.0.0.1:4310.

Sample state lives in `.atsys/control-plane.sqlite` and survives restarts. Set `ATSYS_DATA_DIR` to a separate directory for isolated testing. Companions and notifications remain off. See `docs/ROADMAP.md` for subsequent native integrations.
