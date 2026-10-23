import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import type {
  AgentEvent,
  Evidence,
  Proposal,
  Receipt,
  Role,
  Run,
  Settings,
  State,
  Usage,
} from '../shared/types.js';
import { RUNTIMES, TERMINAL } from '../shared/types.js';
import { Store } from './store.js';
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
export const id = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;
export const now = () => new Date().toISOString();
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function redact(text: string): string {
  return text
    .replace(/("(?:api[_-]?key|token|password|secret)"\s*:\s*")[^"]*"/gi, '$1[REDACTED]\"')
    .replace(/(Bearer\s+)[^\s"']+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,"']+/gi, '$1[REDACTED]')
    .replace(/\bsk-[a-zA-Z0-9_-]{10,}/g, '[REDACTED]')
    .slice(0, 8000);
}
export function event(
  s: State,
  r: Run,
  type: string,
  message: string,
  role: Role = 'worker',
  severity: AgentEvent['severity'] = 'info',
  evidenceIds: string[] = [],
) {
  const a =
    role === 'worker'
      ? s.agents.find((a) => a.role === role && a.sessionId === r.nativeSessionId)
      : s.agents.find((a) => a.projectId === r.projectId && a.role === role);
  const e: AgentEvent = {
    id: id('evt'),
    schemaVersion: 1,
    runId: r.id,
    taskId: r.id,
    agentId: a?.id ?? `${role}-${r.id}`,
    role,
    runtime: role === 'worker' ? r.runtime : (a?.runtime ?? 'deterministic'),
    nativeSessionId: role === 'worker' ? r.nativeSessionId : (a?.sessionId ?? r.nativeSessionId),
    type,
    severity,
    timestamp: now(),
    message: redact(message),
    evidenceIds,
  };
  s.events.unshift(e);
  s.events = s.events.slice(0, 2500);
  return e;
}
function receipt(
  s: State,
  r: Run,
  operation: string,
  outcome: string,
  detail: string,
  proposalId?: string,
): Receipt {
  const rec = {
    id: id('op'),
    runId: r.id,
    proposalId,
    operation,
    outcome,
    detail,
    timestamp: now(),
  };
  s.receipts.push(rec);
  return rec;
}
export function validateResult(data: unknown): { pass: boolean; reason: string } {
  if (!data || typeof data !== 'object') return { pass: false, reason: 'Result must be an object' };
  const d = data as Record<string, unknown>;
  const valid =
    typeof d.total === 'number' &&
    d.total > 0 &&
    Number.isInteger(d.total) &&
    d.completed === d.total &&
    typeof d.accuracy === 'number' &&
    Number.isFinite(d.accuracy) &&
    d.accuracy >= 0.8 &&
    d.accuracy <= 1 &&
    d.passed === true;
  return {
    pass: valid,
    reason: valid
      ? 'Schema valid; all cases complete; accuracy ≥ 0.80.'
      : 'Incomplete cases, invalid schema, failed flag or accuracy below 0.80.',
  };
}
export class ControlPlane {
  constructor(public store: Store) {}
  createProject(input: { name: string; path: string; branch?: string }) {
    if (!isAbsolute(input.path)) throw new DomainError('Repository path must be absolute', 400);
    return this.store.update((s) => {
      const p = {
        id: id('project'),
        name: input.name,
        path: input.path,
        branch: input.branch ?? 'main',
        description: 'Local project · ready for explicit CLI execution',
        color: '#69965a',
        budget: s.settings.dailyBudget,
        createdAt: now(),
        simulated: false,
      };
      s.projects.push(p);
      return p;
    });
  }
  createRun(input: {
    projectId: string;
    name: string;
    objective: string;
    runtime: string;
    scenario?: string;
  }) {
    return this.store.update((s) => {
      if (!s.projects.some((p) => p.id === input.projectId))
        throw new DomainError('Project not found', 404);
      if (!RUNTIMES.includes(input.runtime as (typeof RUNTIMES)[number]))
        throw new DomainError('Unknown runtime', 400);
      const run: Run = {
        id: id('run'),
        projectId: input.projectId,
        name: input.name,
        objective: input.objective,
        command: 'atsys simulator --scenario benchmark',
        runtime: input.runtime,
        adapter: 'simulator',
        status: 'running',
        startedAt: now(),
        updatedAt: now(),
        progress: 0,
        total: 100,
        budget: Math.min(10, s.settings.dailyBudget),
        timeoutSeconds: 3600,
        result: 'not_evaluated',
        validator: 'benchmark-json',
        attempts: 0,
        checkpoint: 'checkpoint-0',
        nativeSessionId: id('sim-session'),
      };
      s.runs.unshift(run);
      s.agents.push({
        id: `worker-${run.id}`,
        projectId: run.projectId,
        name: `${input.runtime}-${run.id.slice(-4)}`,
        role: 'worker',
        runtime: input.runtime,
        model: 'Simulator · no model invoked',
        status: 'healthy',
        capabilities: {
          logs: true,
          toolHooks: false,
          nativePause: false,
          nativeResume: false,
          steering: false,
          usage: false,
        },
        sessionId: run.nativeSessionId,
        lastHeartbeat: now(),
        simulated: true,
      });
      event(
        s,
        run,
        'run.started',
        '[SIMULATION] Managed benchmark started. No coding provider is invoked.',
      );
      return run;
    });
  }
  stop(runId: string) {
    return this.store.update((s) => {
      const r = this.findRun(s, runId);
      if (TERMINAL.includes(r.status)) return r;
      r.status = 'aborted';
      r.result = 'aborted';
      r.finishedAt = now();
      r.updatedAt = now();
      receipt(s, r, 'stop', 'aborted', 'Controlled stop requested by local operator.');
      event(s, r, 'run.stopped', 'Controlled stop recorded. No new work will be scheduled.');
      this.agentStatus(s, r, 'idle');
      return r;
    });
  }
  inject(runId: string, category: string) {
    return this.store.update((s) => {
      const r = this.findRun(s, runId);
      if (r.adapter !== 'simulator' || r.status !== 'running')
        throw new DomainError('Only a running simulation can inject an incident');
      r.status = 'awaiting_approval';
      r.updatedAt = now();
      const content = `[SIMULATION] ${category === 'crash' ? 'Worker exited with code 137' : category === 'stall' ? 'No verifiable progress within heartbeat window' : 'Output evaluation failed declared threshold'}. Checkpoint ${r.checkpoint} retained. External effects reconciled.`;
      const ev: Evidence = {
        id: id('evidence'),
        runId: r.id,
        kind: 'log',
        title: `${category} · detector evidence`,
        content,
        digest: hash(content),
        createdAt: now(),
        simulated: true,
      };
      s.evidence.push(ev);
      const inc = {
        id: id('INC'),
        runId: r.id,
        severity: 'critical' as const,
        category,
        title:
          category === 'crash'
            ? 'Worker exited unexpectedly'
            : category === 'stall'
              ? 'Worker progress has stalled'
              : 'Output validation failed',
        diagnosis: `Deterministic detector observed a simulated ${category}. Evidence is retained. A checkpoint restart requires a local operator decision under observe-only policy.`,
        status: 'investigating' as const,
        evidenceIds: [ev.id],
        createdAt: now(),
        updatedAt: now(),
      };
      s.incidents.unshift(inc);
      const p: Proposal = {
        id: id('proposal'),
        incidentId: inc.id,
        runId: r.id,
        action: 'restart_checkpoint',
        target: r.id,
        parameters: { checkpoint: r.checkpoint ?? 'checkpoint-0' },
        confidence: 0.91,
        impact:
          'Replay the simulated worker from the last durable checkpoint. No external effects.',
        rollback: 'Stop simulated attempt; preserve original evidence.',
        verification: 'Fresh heartbeat, validated output artifact and accuracy ≥ 0.80.',
        status: 'pending',
      };
      s.proposals.unshift(p);
      event(s, r, 'incident.detected', content, 'observer', 'critical', [ev.id]);
      event(
        s,
        r,
        'recovery.proposed',
        '[SIMULATION] Checkpoint restart proposed; awaiting human decision.',
        'supervisor',
        'warning',
        [ev.id],
      );
      this.agentStatus(s, r, 'degraded');
      return inc;
    });
  }
  decide(proposalId: string, decision: 'approve' | 'reject') {
    return this.store.update((s) => {
      const p = s.proposals.find((p) => p.id === proposalId);
      if (!p) throw new DomainError('Proposal not found', 404);
      const desired = decision === 'approve' ? 'approved' : 'rejected';
      if (p.status !== 'pending') {
        if (p.status === desired) return s.receipts.find((r) => r.id === p.receiptId)!;
        throw new DomainError('Proposal already decided');
      }
      const r = this.findRun(s, p.runId);
      if (decision === 'approve') {
        if (
          r.adapter !== 'simulator' ||
          r.status !== 'awaiting_approval' ||
          p.target !== r.id ||
          p.action !== 'restart_checkpoint' ||
          p.parameters.checkpoint !== r.checkpoint ||
          r.attempts >= s.settings.retryLimit
        )
          throw new DomainError(
            'Policy denied: incompatible target, state, checkpoint or exhausted attempt limit',
          );
        r.attempts++;
        r.status = 'running';
        r.updatedAt = now();
        this.agentStatus(s, r, 'healthy');
        event(
          s,
          r,
          'recovery.authorized',
          '[SIMULATION] Human-approved checkpoint restart. This is not native provider resume.',
          'supervisor',
        );
      } else {
        if (!TERMINAL.includes(r.status)) {
          r.status = 'blocked';
          r.result = 'incomplete';
          r.updatedAt = now();
          this.agentStatus(s, r, 'idle');
        }
        event(
          s,
          r,
          'recovery.rejected',
          'Recovery rejected by local operator; run will not restart.',
          'supervisor',
          'warning',
        );
      }
      p.status = desired;
      p.decidedAt = now();
      const rec = receipt(
        s,
        r,
        p.action,
        desired,
        decision === 'approve'
          ? `Policy verified exact target ${r.id}, checkpoint ${p.parameters.checkpoint}, attempt ${r.attempts}/${s.settings.retryLimit}. Simulated verification pending.`
          : 'Human denied recovery. No action performed.',
        p.id,
      );
      p.receiptId = rec.id;
      const inc = s.incidents.find((i) => i.id === p.incidentId);
      if (inc) {
        inc.status = decision === 'approve' ? 'investigating' : 'acknowledged';
        inc.updatedAt = now();
      }
      return rec;
    });
  }
  acknowledge(incidentId: string) {
    return this.store.update((s) => {
      const i = s.incidents.find((i) => i.id === incidentId);
      if (!i) throw new DomainError('Incident not found', 404);
      if (i.status !== 'resolved' && i.status !== 'acknowledged') {
        i.status = 'acknowledged';
        i.updatedAt = now();
        receipt(
          s,
          this.findRun(s, i.runId),
          'acknowledge',
          'acknowledged',
          `Operator acknowledged ${i.id}; this does not resolve the incident.`,
        );
      }
      return i;
    });
  }
  updateSettings(patch: Partial<Settings>) {
    return this.store.update((s) => {
      Object.assign(s.settings, patch);
      return s.settings;
    });
  }
  recordUsage(usage: Usage) {
    return this.store.update((s) => {
      if (!s.usage.some((u) => u.invocationId === usage.invocationId)) s.usage.push(usage);
    });
  }
  tick() {
    const state = this.store.read();
    if (!state.runs.some((r) => r.adapter === 'simulator' && r.status === 'running')) return;
    this.store.update((s) => {
      for (const r of s.runs) {
        if (r.adapter !== 'simulator' || r.status !== 'running') continue;
        if (Date.now() - Date.parse(r.startedAt) > r.timeoutSeconds * 1000) {
          r.status = 'failed';
          r.result = 'incomplete';
          r.updatedAt = now();
          r.finishedAt = now();
          receipt(s, r, 'timeout', 'failed', 'Declared task timeout exceeded.');
          event(s, r, 'run.timeout', 'Task exceeded its declared timeout.', 'observer', 'critical');
          this.agentStatus(s, r, 'idle');
          continue;
        }
        r.progress = Math.min(r.total ?? 100, (r.progress ?? 0) + 4);
        r.updatedAt = now();
        this.agentStatus(s, r, 'healthy');
        if (r.progress % 20 === 0) {
          r.checkpoint = `checkpoint-${r.progress}`;
          event(
            s,
            r,
            'checkpoint.created',
            `[SIMULATION] ${r.progress}/${r.total} cases committed. Checkpoint persisted.`,
          );
        } else if (r.progress % 8 === 0)
          event(
            s,
            r,
            'evaluation.progress',
            `[SIMULATION] ${r.progress}/${r.total} cases evaluated. Heartbeat verified.`,
          );
        if (r.progress === r.total) {
          const content = JSON.stringify({
            simulated: true,
            total: r.total,
            completed: r.progress,
            accuracy: 0.86,
            passed: true,
          });
          const result = validateResult(JSON.parse(content));
          const ev: Evidence = {
            id: id('artifact'),
            runId: r.id,
            kind: 'artifact',
            title: 'results.json · simulated evaluation',
            content,
            digest: hash(content),
            createdAt: now(),
            simulated: true,
          };
          s.evidence.push(ev);
          const rec = receipt(
            s,
            r,
            'validate',
            result.pass ? 'passed' : 'failed',
            `[SIMULATION] ${result.reason} SHA-256 ${ev.digest}`,
          );
          r.status = result.pass ? 'completed' : 'failed';
          r.result = result.pass ? 'validated_pass' : 'validated_fail';
          r.validatorReceiptId = rec.id;
          r.artifact = ev.id;
          r.finishedAt = now();
          event(s, r, 'evaluation.completed', `[SIMULATION] ${result.reason}`, 'observer', 'info', [
            ev.id,
          ]);
          this.agentStatus(s, r, 'idle');
          for (const i of s.incidents.filter((i) => i.runId === r.id)) {
            i.status = 'resolved';
            i.updatedAt = now();
          }
        }
      }
    });
  }
  reconcile() {
    this.store.update((s) => {
      for (const r of s.runs) {
        if (r.adapter === 'local-process' && !TERMINAL.includes(r.status)) {
          r.status = 'blocked';
          r.result = 'incomplete';
          r.updatedAt = now();
          receipt(
            s,
            r,
            'reconcile',
            'blocked',
            'Service restarted. Native process outcome unknown; manual reconciliation required. No replay.',
          );
          event(
            s,
            r,
            'run.orphaned',
            'Local process session lost. Inspect external effects before starting another run.',
            'observer',
            'warning',
          );
        }
      }
    });
  }
  private agentStatus(s: State, r: Run, status: 'healthy' | 'degraded' | 'idle') {
    const exact = s.agents.filter((a) => a.sessionId === r.nativeSessionId);
    for (const a of exact) {
      a.status = status;
      a.lastHeartbeat = now();
    }
    for (const a of s.agents.filter((a) => a.projectId === r.projectId && a.role !== 'worker'))
      a.lastHeartbeat = now();
  }
  private findRun(s: State, runId: string) {
    const r = s.runs.find((r) => r.id === runId);
    if (!r) throw new DomainError('Run not found', 404);
    return r;
  }
}
