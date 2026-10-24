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
  const next =
    task.status === 'needs_attention'
      ? (supervisor?.proposal?.blocker?.requiredResolution ??
        task.attentionReason ??
        'Inspect the blocker before retrying.')
      : task.status === 'completed'
        ? 'No action needed. The declared acceptance check passed.'
        : task.status === 'stopped'
          ? 'Stopped. Review saved state before authorizing a retry.'
          : task.status === 'supervising'
            ? 'Automatic diagnosis underway. No action required.'
            : task.status === 'repairing'
              ? 'Authorized repair underway. No action required.'
              : task.status === 'recovering'
                ? 'Waiting for the configured retry; saved progress is retained.'
                : 'No action needed. AtSys is monitoring within the configured limits.';
  const activity =
    task.status === 'supervising'
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
    id: task.id,
    name: task.config.name,
    objective: task.config.objective,
    status: task.status,
    state,
    phase,
    activity,
    progress: progressWorker?.progress ?? null,
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

export function readableAttemptLog(output: string, limit = 12) {
  const messages: string[] = [];
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.item?.type === 'agent_message' && typeof event.item.text === 'string') {
        try {
          const result = JSON.parse(event.item.text);
          messages.push(
            typeof result?.reason === 'string'
              ? shortText(`Decision: ${result.action ?? 'recorded'}. ${result.reason}`, 600)
              : 'Structured response recorded; open raw output for technical details.',
          );
        } catch {
          messages.push(shortText(event.item.text, 600));
        }
      } else if (event.type === 'error')
        messages.push(shortText(event.message ?? 'Worker error', 400));
      else if (
        event.item?.type === 'command_execution' &&
        event.item.status === 'completed' &&
        event.item.exit_code !== 0
      )
        messages.push(
          `A tool check failed (exit ${event.item.exit_code ?? 'unknown'}). Inspect full JSON for the redacted transcript.`,
        );
    } catch {
      // Bounded snapshots can begin in the middle of a provider JSON line. Do not
      // turn that truncated nested tool payload back into a wall of escaped text.
      if (!/^\s*[{[]/.test(line) && !line.includes('\\"')) messages.push(shortText(line, 400));
    }
  }
  return (
    messages.slice(-Math.max(1, Math.min(limit, 100))).join('\n\n') ||
    'No readable messages recorded. Full tool transcripts remain available through task show.'
  );
}
