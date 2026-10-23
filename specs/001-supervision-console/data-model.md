# Data model

All entities have stable IDs and ISO timestamps. `State` has `schemaVersion: 1`, `revision`, collections and global settings. SQLite stores one atomic versioned state document; updates and receipts commit together.

| Entity | Fields and constraints |
| --- | --- |
| Project | id, name, path, branch, description, color, budget, createdAt; path must be absolute for local execution |
| Agent | id, projectId, role (worker/observer/supervisor), runtime, model, status, capabilities, sessionId, lastHeartbeat, simulated |
| Run | id, projectId, name, objective, command, runtime, adapter, status, startedAt, updatedAt, finishedAt, progress/total (nullable), budget, timeoutSeconds, validator, result, artifact, validatorReceiptId, attempts, checkpoint, nativeSessionId |
| Event | id, schemaVersion, runId, taskId, agentId, role, runtime, nativeSessionId, type, severity, timestamp, message, evidenceIds |
| Incident | id, runId, severity, category, title, diagnosis, status, evidenceIds, createdAt, updatedAt |
| Proposal | id, incidentId, runId, action, target, parameters, confidence, impact, rollback, verification, status, decidedAt, receiptId |
| Evidence | id, runId, kind, title, content, digest, sourceDigest?, sourcePath?, createdAt, simulated |
| Receipt | id, runId, proposalId?, operation, outcome, detail, timestamp; append-only |
| Usage | id, invocationId, runId, runtime, model, role, amount:number|null, inputTokens, outputTokens, source, pricingDate, timestamp, simulated; unique invocationId |
| Settings | dailyBudget, retryLimit (0..5), staleAfterSeconds, recoveryMode, memoryMode, notification preferences |

## Transitions
- Run: running → awaiting_approval / completed / failed / aborted / blocked; awaiting_approval → running / blocked / aborted. Terminal states cannot restart through old proposals.
- Result: not_evaluated → validated_pass / validated_fail / incomplete / aborted. Validated pass requires successful validator receipt and evidence digest.
- Incident: open → investigating / resolved / acknowledged. Acknowledgement is not resolution.
- Proposal: pending → approved / rejected. Repeat identical decisions return existing receipt; contradictory decisions conflict.
- Recovery requires a pending exact-target proposal, nonterminal simulated run, attempt limit and a compatible independent policy action. No real-process mutation via demo recovery.
- Startup blocks orphaned real runs for reconciliation; simulated runs may advance from durable checkpoint. No inferred native resume.
