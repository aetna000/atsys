# HTTP API contract v1

Base `/api`. Responses are JSON; errors `{error:string}` with 400 invalid input, 403 origin/host, 404 missing identity, 409 transition/policy conflict. Bind 127.0.0.1 only. Mutation requires JSON and a same-origin/loopback development Origin when supplied. No cross-origin CORS.

| Method | Path | Request | Result |
| --- | --- | --- | --- |
| GET | /health | — | version, server timestamp |
| GET | /state | — | State snapshot; redacted domain data |
| GET | /doctor | — | Actual provider binary availability and capability diagnostics; no credentials |
| POST | /projects | name,path,branch? | Project; does not modify repository source |
| POST | /runs | projectId,name,objective,runtime,scenario? | Explicitly simulated Run |
| POST | /runs/:id/stop | {} | Run + stop receipt; idempotent |
| POST | /runs/:id/incident | category:crash/stall/evaluation | Synthetic incident + exact recovery proposal; simulation only |
| POST | /proposals/:id/decision | decision:approve/reject | Durable receipt; idempotent for identical decision |
| POST | /incidents/:id/acknowledge | {} | Incident + acknowledgement receipt |
| PATCH | /settings | validated subset | Persisted settings |

Polling returns a snapshot every two seconds; the UI pauses its displayed log stream independently. The UI never falls back to fabricated live data on API failure. Cost deduplication uses invocationId. Unknown amount is null.

## Adapter contract
`RuntimeAdapter` advertises capabilities and supports discover, start, cancel and result. Simulator is full sample lifecycle; local-process is basic argv execution with coarse logs and controlled cancellation. Native provider adapters are catalog entries only until implemented. CLI process execution is not exposed as arbitrary HTTP shell input.
