import type { ManagedTask } from './operations.js';

export const plainText = (value: string) =>
  value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
export function shortText(value: string, limit = 200) {
  const text = plainText(value).replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : text.slice(0, limit - 1) + '…';
}
export function taskPresentation(task: ManagedTask) {
  const current = task.attempts.at(-1);
  const worker = task.attempts.findLast((a) => a.phase === 'worker');
  const progressWorker = task.attempts.findLast((a) => a.phase === 'worker' && a.progress);
  const supervisor = task.attempts.findLast((a) => a.phase === 'supervisor' && a.proposal);
  const observer = task.events.find((e) =>
    ['goal.checked', 'setup.checked', 'incident.opened', 'runner.lost'].includes(e.type),
  );
  const state = {
    queued: 'Waiting to start',
    pausing: 'Pausing local processes',
    paused: 'Local processes paused',
    resuming: 'Resuming local processes',
    running: 'Working',
    recovering: 'Recovery scheduled',
    supervising: 'Diagnosing a problem',
    repairing: 'Repairing',
    needs_attention: 'Needs your help',
    completed: 'Completed and validated',
    stopped: 'Stopped',
  }[task.status];
  const phase =
    current?.phase === 'validator'
      ? 'Independent acceptance check'
      : current?.phase === 'supervisor'
        ? 'Supervisor diagnosis'
        : current?.phase === 'repair'
          ? 'Bounded repair'
          : 'Worker execution';
  const next = task.pauseState
    ? task.status === 'paused'
      ? 'Resume to continue, or stop to terminate owned processes. Remote provider requests may continue.'
      : 'Waiting for the watchdog to confirm the process control request.'
    : task.status === 'needs_attention'
      ? (supervisor?.proposal?.blocker?.requiredResolution ??
        task.attentionReason ??
        'Inspect the blocker before retrying.')
      : task.status === 'completed'
        ? 'Review the durable outcome report, deliverables and any domain failures or limitations.'
        : task.status === 'stopped'
          ? 'Stopped. Review saved state before authorizing a retry.'
          : task.status === 'supervising'
            ? 'Automatic diagnosis underway. No action required.'
            : task.status === 'repairing'
              ? 'Authorized repair underway. No action required.'
              : task.status === 'recovering'
                ? 'Waiting for the configured retry; saved progress is retained.'
                : 'No action needed. AtSys is monitoring within the configured limits.';
  const activity = task.pauseState
    ? 'Local process control is active. Remote provider requests and provider-internal deadlines may continue.'
    : task.status === 'supervising'
      ? 'The observer detected a problem; the supervisor is investigating now.'
      : task.status === 'repairing'
        ? 'Policy authorized a bounded repair. The repair worker is fixing the cause before retry.'
        : task.status === 'recovering'
          ? 'Recovery is scheduled. The next worker receives the saved checkpoint and recovery guidance.'
          : task.status === 'completed'
            ? 'The independent acceptance check passed.'
            : task.status === 'needs_attention'
              ? (task.attentionReason ?? 'A concrete blocker requires attention.')
              : (worker?.progress?.checkpoint ?? phase);
  return {
    goal: task.config.objective,
    successCriteria: task.config.goalContract?.successCriteria ?? [],
    report: task.reports?.at(-1),
    reportError: task.reportError,
    paused: !!task.pauseState,
    policy: {
      worker: task.config.worker,
      model: task.config.model || 'configured default',
      recovery: task.config.recovery,
      maxRetries: task.config.maxRetries,
      allowRepair: task.config.allowRepair,
      workerTimeout: task.config.timeoutSeconds,
      taskTimeout: task.config.taskTimeoutSeconds,
      heartbeatTimeout: task.config.heartbeatTimeoutSeconds,
    },
    id: task.id,
    name: task.config.name,
    objective: task.config.objective,
    status: task.status,
    state,
    phase,
    activity,
    progress: progressWorker?.progress ?? null,
    milestones: (progressWorker?.progress?.milestones ?? []).map((name, index) => ({
      name,
      status:
        index < progressWorker!.progress!.completed
          ? 'reported complete'
          : index === progressWorker!.progress!.completed &&
              progressWorker?.status === 'running' &&
              progressWorker.id === worker?.id
            ? 'current'
            : 'pending',
    })),
    progressSource: progressWorker
      ? {
          reporter: progressWorker.progressReporter
            ? `${progressWorker.progressReporter.kind === 'hook' ? 'Project hook' : 'Progress file'}: ${progressWorker.progressReporter.reference}`
            : 'Legacy progress report; reporting source was not recorded',
          explanation: progressWorker.progress?.milestones
            ? progressWorker.progress.planSource!
            : 'Milestone names and their derivation were not recorded. The total came from the progress reporter; AtSys did not prescribe this number.',
        }
      : null,
    acceptance:
      task.status === 'completed'
        ? 'Declared validator passed'
        : 'Independent validation still required',

    progressFromPreviousAttempt: !!progressWorker && progressWorker.id !== worker?.id,
    workerStatus:
      worker?.status === 'succeeded' && task.status !== 'completed'
        ? 'exited; goal not validated'
        : (worker?.status ?? 'not started'),
    heartbeatAt: current?.heartbeatAt ?? null,
    observerAt: observer?.at ?? null,
    observerSummary: observer
      ? observer.type === 'setup.checked'
        ? 'Startup doctor check recorded; full receipt is in technical details'
        : observer.type === 'goal.checked'
          ? 'Periodic liveness and goal-progress check recorded'
          : shortText(observer.message, 200)
      : 'No check recorded yet',
    supervisor:
      task.status === 'supervising'
        ? 'Investigating now; a recovery decision is pending'
        : supervisor?.proposal
          ? `${supervisor.proposal.action}: ${supervisor.proposal.reason}`
          : task.config.recovery !== 'supervised'
            ? `Disabled; ${task.config.recovery === 'notify' ? 'notify-only recovery' : 'deterministic restart policy'}`
            : ['completed', 'stopped', 'needs_attention'].includes(task.status)
              ? 'Inactive; task is not executing'
              : 'On standby; called when an incident needs diagnosis',
    blocker: task.status === 'needs_attention' ? (task.attentionReason ?? null) : null,
    next,
    progressWindow: task.config.progressTimeoutSeconds,
    updatedAt: task.updatedAt,
  };
}
function age(at: string | null, now: number) {
  if (!at) return 'not recorded';
  const seconds = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  if (!Number.isFinite(seconds)) return 'unknown';
  return seconds < 60
    ? `${seconds}s ago`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ago`
      : `${Math.floor(seconds / 3600)}h ago`;
}
export function formatTaskStatus(
  task: ManagedTask,
  width = 88,
  now = Date.now(),
  dashboard = 'http://127.0.0.1:4310',
  maxRows = Infinity,
) {
  width = Math.max(40, Math.min(width, 160));
  const p = taskPresentation(task);
  const lines: string[] = [];
  const compact = maxRows < 30;
  const row = (label: string, value: string, maxLines = compact ? 1 : 2) => {
    const prefix = label ? `${label}: ` : '';
    let rest = plainText(value).replace(/\s+/g, ' ').trim();
    for (let n = 0; n < maxLines && rest; n++) {
      const start = n ? '  ' : prefix;
      const room = width - start.length;
      if (rest.length <= room) {
        lines.push(start + rest);
        break;
      }
      if (n === maxLines - 1) {
        lines.push(start + rest.slice(0, room - 1) + '…');
        break;
      }
      const split = rest.lastIndexOf(' ', room);
      const end = split > room / 2 ? split : room;
      lines.push(start + rest.slice(0, end));
      rest = rest.slice(end).trim();
    }
  };
  row('', 'ATSYS · TASK MONITOR');
  row('', p.name);
  lines.push('─'.repeat(width));
  const latest = taskLogEntries(task, 1)[0];
  if (latest) row('Latest', `${latest.phase}: ${latest.message}`, 1);
  row('State', p.state);
  row('Goal', p.objective);
  row(
    'Phase',
    ['completed', 'stopped', 'needs_attention'].includes(task.status) ? 'Not executing' : p.phase,
  );
  row(
    'Progress',
    p.progress
      ? `${p.progress.completed}/${p.progress.total} reported units${p.progressFromPreviousAttempt ? ' (saved checkpoint)' : ''}`
      : 'Not reported; no percentage assumed',
  );
  if (p.progress?.checkpoint) row('Checkpoint', p.progress.checkpoint);
  if (p.milestones.length && !compact) {
    row('Plan source', p.progressSource!.explanation, 3);
    for (const [index, milestone] of p.milestones.entries())
      row(`${index + 1} · ${milestone.status}`, milestone.name, 3);
    row('Acceptance', p.acceptance);
  }
  row('Success criteria', p.successCriteria.join('; ') || 'Legacy objective and validator');
  row(
    'Outcome report',
    p.reportError ??
      (p.report
        ? `atsys task report ${task.id} · ${p.report.retrospective ? 'retrospective' : 'automatic'}`
        : 'Pending / legacy: explicit retrospective generation available'),
  );
  row('Worker', `${p.workerStatus}; last runner heartbeat ${age(p.heartbeatAt, now)}`);
  row(
    'Observer',
    `Last check ${age(p.observerAt, now)}; goal-stall window ${p.progressWindow ? p.progressWindow + 's' : 'disabled'}`,
  );
  row('Supervisor', p.supervisor);
  if (p.blocker) row('Problem', p.blocker);
  lines.push('');
  row('NEXT', p.next, compact ? 2 : 4);
  lines.push('');
  row('Task', p.id);
  row('Dashboard', `${dashboard}/tasks/${task.id}`);
  if (!compact)
    row('Details', 'task logs <id> for readable messages; task show <id> for full JSON');
  return lines.join('\n');
}

export interface ActivityEntry {
  id: string;
  kind: 'message' | 'tool' | 'error' | 'progress' | 'system';
  message: string;
  phase?: string;
  attemptId?: string;
}
function messageText(value: unknown, depth = 0): string {
  if (depth > 5) return 'Structured output recorded; raw details are available separately.';
  if (typeof value === 'string') {
    const text = plainText(value).trim();
    try {
      return messageText(JSON.parse(text), depth + 1);
    } catch {
      return text.slice(0, 4000);
    }
  }
  if (!value || typeof value !== 'object') return '';
  const row = value as Record<string, any>;
  if (typeof row.pilot_completed === 'string')
    return `Pilot task completed: ${shortText(row.pilot_completed, 160)}`;
  if (typeof row.reason === 'string')
    return `Decision: ${row.action ?? 'recorded'}. ${plainText(row.reason)}`;
  for (const key of ['message', 'text', 'summary', 'detail'])
    if (typeof row[key] === 'string') return messageText(row[key], depth + 1);
  if (row.error) return messageText(row.error, depth + 1);
  if (typeof row.completed === 'number' && typeof row.total === 'number')
    return `Progress: ${row.completed}/${row.total}${row.checkpoint ? ` · ${shortText(String(row.checkpoint))}` : ''}`;
  return 'Structured output recorded; raw details are available separately.';
}
export const readableMessage = (value: string, limit = 600) => shortText(messageText(value), limit);
export function attemptLogEntries(output: string, limit = 100): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  const pilotCompleted = new Set<string>();
  let pilotTotal: number | undefined;
  let lines = output.split('\n');
  try {
    const document = JSON.parse(output);
    if (document && typeof document === 'object' && !Array.isArray(document)) lines = [output];
  } catch {
    /* Streamed JSON lines are parsed individually below. */
  }
  for (const [index, raw] of lines.entries()) {
    const line = plainText(raw).trim();
    if (!line) continue;
    const push = (kind: ActivityEntry['kind'], message: string) => {
      if (message.trim())
        entries.push({ id: String(index), kind, message: plainText(message).slice(0, 4000) });
    };
    try {
      const event = JSON.parse(line);
      const item = event?.item ?? event;
      const type = item?.type;
      if (
        typeof event.qualified_recovery_epoch === 'string' &&
        Number.isSafeInteger(event.tasks) &&
        event.tasks > 0
      ) {
        pilotTotal = event.tasks;
        push('progress', `Pilot qualified: ${pilotTotal} tasks; awaiting completion reports`);
      } else if (typeof event.pilot_completed === 'string' && event.pilot_completed.trim()) {
        pilotCompleted.add(event.pilot_completed);
        const count = pilotTotal === undefined ? '' : ` ${pilotCompleted.size}/${pilotTotal}`;
        push('progress', `Pilot${count} completed · ${shortText(event.pilot_completed, 160)}`);
      } else if (type === 'agent_message' || type === 'message') {
        const text =
          item.text ??
          item.content
            ?.filter((c: any) => typeof c.text === 'string')
            .map((c: any) => c.text)
            .join('\n');
        if (typeof text === 'string') push('message', messageText(text));
      } else if (
        ['command_execution', 'tool_execution', 'mcp_tool_call', 'function_call'].includes(type)
      ) {
        let args = item.arguments ?? item.input ?? {};
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            args = {};
          }
        }
        const command = item.command ?? args.command ?? args.cmd;
        const name = command
          ? shortText(String(command), 260)
          : shortText(String(item.name ?? item.tool ?? type.replaceAll('_', ' ')), 120);
        const finished =
          event.type?.endsWith('.completed') || ['completed', 'failed'].includes(item.status);
        const failed =
          item.status === 'failed' ||
          (item.exit_code !== undefined && item.exit_code !== null && item.exit_code !== 0);
        const state = finished ? (failed ? 'Failed' : 'Finished') : 'Running';
        push(
          failed ? 'error' : 'tool',
          `${state}${item.exit_code !== undefined && item.exit_code !== null ? ` (exit ${item.exit_code})` : ''}: ${name}`,
        );
      } else if (type === 'file_change') {
        const paths = (item.changes ?? []).map((c: any) =>
          shortText(String(c.path ?? c.file ?? 'file'), 140),
        );
        push(
          'tool',
          `Files ${item.status === 'failed' ? 'not updated' : event.type?.endsWith('.completed') ? 'updated' : 'being updated'}${paths.length ? ': ' + paths.slice(0, 8).join(', ') : ''}`,
        );
      } else if (
        event.type === 'error' ||
        event.type === 'turn.failed' ||
        !!event.error ||
        event.level === 'error'
      ) {
        push('error', messageText(event.error ?? event.message ?? 'Worker error'));
      } else if (
        typeof event.message === 'string' ||
        typeof event.text === 'string' ||
        typeof event.summary === 'string' ||
        typeof event.reason === 'string' ||
        typeof event.detail === 'string'
      ) {
        push('message', messageText(event));
      } else if (typeof event.completed === 'number' && typeof event.total === 'number') {
        push('progress', messageText(event));
      } else if (event.type === 'turn.started') push('system', 'Codex turn started');
      else if (event.type === 'turn.completed') push('system', 'Codex turn finished');
      else if (!event.type && event && typeof event === 'object')
        push('system', messageText(event));
      // Provider envelopes, usage and nested tool payloads stay in the raw view.
    } catch {
      // A bounded snapshot can start inside a JSON payload. Never display escaped fragments.
      if (!/^[{[\]}]/.test(line) && !/^"[^"]+"\s*:/.test(line) && !line.includes('\\"'))
        push('message', line);
    }
  }
  return entries.slice(-Math.max(1, Math.min(limit, 100))).reverse();
}
export function taskLogEntries(
  task: ManagedTask,
  limit = 100,
  attemptId?: string,
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const attempt of [...task.attempts].reverse()) {
    if (attemptId && attempt.id !== attemptId) continue;
    const logs = attemptLogEntries(attempt.output);
    if (attempt.failure || attempt.validation || !logs.length)
      entries.push({
        id: `${attempt.id}:status`,
        kind: attempt.failure ? 'error' : 'system',
        message:
          attempt.failure ??
          attempt.validation?.detail ??
          `${attempt.phase}: ${attempt.status}${attempt.status === 'running' ? ' · waiting for output' : ''}`,
        phase: attempt.phase,
        attemptId: attempt.id,
      });
    entries.push(
      ...logs.map((entry) => ({
        ...entry,
        id: `${attempt.id}:${entry.id}`,
        phase: attempt.phase,
        attemptId: attempt.id,
      })),
    );
  }
  return entries.slice(0, Math.max(1, Math.min(limit, 100)));
}
export function readableTaskLog(task: ManagedTask, limit = 12) {
  const entries = taskLogEntries(task, limit);
  return (
    (entries.map((entry) => `[${entry.phase} · ${entry.kind}] ${entry.message}`).join('\n\n') ||
      'Worker has not started.') +
    (task.reports?.at(-1) ? '\n\n' + task.reports.at(-1)!.markdown : '') +
    (task.reportError ? '\n\n' + task.reportError : '')
  );
}
export function readableAttemptLog(output: string, limit = 12) {
  return (
    attemptLogEntries(output, limit)
      .map((entry) => entry.message)
      .join('\n\n') ||
    'No readable messages recorded. Full tool transcripts remain available through task show.'
  );
}
