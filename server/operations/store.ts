import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { OperationsState, ManagedTask, TaskEvent } from '../../shared/operations.js';
import { taskDefaults } from '../../shared/operations.js';
import { redact } from '../control-plane.js';
import { persistReport, terminal, terminalKey } from './reports.js';
import { queueLifecycleHooks } from './hooks.js';
export const stamp = () => new Date().toISOString();
export const uid = (prefix: string) => `${prefix}-${randomUUID()}`;
export function taskEvent(
  task: ManagedTask,
  role: TaskEvent['role'],
  type: string,
  message: string,
) {
  task.updatedAt = stamp();
  const id = uid('evt');
  task.events.unshift({ id, at: task.updatedAt, role, type, message: redact(message) });
  task.events = task.events.slice(0, 500);
  queueLifecycleHooks(task, type, id);
}
export function enqueue(
  s: OperationsState,
  task: ManagedTask,
  kind: 'Incident' | 'Recovery' | 'Completed',
  detail: string,
  key: string,
) {
  if (!s.telegram.enabled || !s.telegram.hasToken || !s.telegram.chatId) return;
  if (
    (kind === 'Incident' && !s.telegram.onIncident) ||
    (kind === 'Recovery' && !s.telegram.onRecovery) ||
    (kind === 'Completed' && !s.telegram.onCompletion)
  )
    return;
  if (s.deliveries.some((d) => d.key === key)) return;
  s.deliveries.unshift({
    id: uid('msg'),
    key,
    taskId: task.id,
    text: redact(`AtSys · ${kind}\n${task.config.name}\n${task.id}\n${detail}`).slice(0, 4000),
    status: 'pending',
    attempts: 0,
    nextAt: stamp(),
    createdAt: stamp(),
  });
}
export class OperationsStore {
  readonly directory: string;
  private db: DatabaseSync;
  constructor(directory: string) {
    this.directory = resolve(directory);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const path = join(this.directory, 'operations.sqlite');
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(
      'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000; CREATE TABLE IF NOT EXISTS operations (id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL)',
    );
    this.db.prepare('INSERT OR IGNORE INTO operations(id,document) VALUES(1,?)').run(
      JSON.stringify({
        version: 1,
        tasks: [],
        daemon: null,
        telegram: {
          enabled: false,
          chatId: '',
          hasToken: false,
          onIncident: true,
          onRecovery: true,
          onCompletion: true,
          maxAttempts: 5,
        },
        deliveries: [],
      } satisfies OperationsState),
    );
  }
  read(): OperationsState {
    const s = JSON.parse(
      (this.db.prepare('SELECT document FROM operations WHERE id=1').get() as { document: string })
        .document,
    ) as OperationsState;
    for (const t of s.tasks) {
      t.config = { ...taskDefaults, ...t.config };
      for (const a of t.attempts) a.config = { ...taskDefaults, ...a.config };
    }
    return s;
  }
  update<T>(fn: (s: OperationsState) => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const s = this.read();
      const previous = new Map(
        s.tasks.map((t) => [t.id, { status: t.status, key: terminalKey(t) }]),
      );
      const result = fn(s);
      for (const t of s.tasks) {
        const before = previous.get(t.id);
        if (
          terminal(t) &&
          before &&
          (before.status !== t.status || before.key !== terminalKey(t))
        ) {
          try {
            const r = persistReport(this.directory, t);
            taskEvent(
              t,
              'system',
              'report.generated',
              `Durable outcome report ${r.id} · SHA-256 ${r.digest}. Workflow acceptance: ${r.workflowAccepted ? 'declared validator passed' : 'not established'}; domain results remain explicitly sourced. Access with atsys task report ${t.id}.`,
            );
          } catch (error) {
            t.reportError =
              'Terminal report generation or verification failed. Review durable storage and outcome evidence; completion is not established. ' +
              redact(error instanceof Error ? error.message : 'Unknown report error').slice(0, 600);
            if (t.status === 'completed') {
              t.status = 'needs_attention';
              t.attentionReason = t.reportError;
            }
            for (const delivery of s.deliveries) {
              if (
                delivery.taskId === t.id &&
                delivery.status === 'pending' &&
                delivery.key === `${t.attempts.at(-1)?.id}:complete`
              ) {
                delivery.status = 'failed';
                delivery.error =
                  'Completion delivery withheld because durable report generation failed.';
              }
            }
            taskEvent(t, 'system', 'report.failed', t.reportError);
          }
        }
      }
      this.db.prepare('UPDATE operations SET document=? WHERE id=1').run(JSON.stringify(s));
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
