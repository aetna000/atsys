// Invoked by Codex's native hooks. No API/dashboard or transcript access is needed.
import { randomUUID } from 'node:crypto';
import { OperationsStore, stamp, taskEvent } from './store.js';
import { nativeEvents, codexHookConfig } from './codex-hooks.js';
import { nativeEvent } from './provider-hooks.js';
import { providerFor, type AgentProvider } from '../../shared/providers.js';
import { queueHooks } from './hooks.js';
const hookId = process.argv[2];
const provider = (process.argv[3] ?? 'codex') as AgentProvider;
let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
  if (Buffer.byteLength(input) > 64000) {
    if (provider === 'copilot') {
      console.log(
        JSON.stringify({
          permissionDecision: 'deny',
          permissionDecisionReason: 'AtSys hook input exceeds 64 KB',
        }),
      );
      process.exit(2);
    }
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'AtSys hook input exceeds 64 KB',
        },
      }),
    );
    process.exit(0);
  }
}
if (hookId === '--config') {
  console.log(JSON.stringify(codexHookConfig(JSON.parse(input)), null, 2));
  process.exit(0);
}
if (!process.env.ATSYS_TASK_ID || !process.env.ATSYS_ATTEMPT_ID || !process.env.ATSYS_DATA_DIR) {
  console.log('{}');
  process.exit(0);
}
const store = new OperationsStore(process.env.ATSYS_DATA_DIR);
let eventName = '';
function deny(reason: string) {
  if (provider === 'copilot')
    return eventName === 'preToolUse' || !eventName
      ? { permissionDecision: 'deny', permissionDecisionReason: reason }
      : { additionalContext: reason };
  if (!eventName || eventName === 'PreToolUse')
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    };
  // Fail/escalate stops this prompt/turn. Never manufacture an approval or continuation.
  return { continue: false, stopReason: reason, systemMessage: reason };
}
try {
  const payload = JSON.parse(input);
  eventName = process.argv[4] ?? payload.hook_event_name;
  const portable = nativeEvent(provider, eventName);
  const legacy = provider === 'codex' ? nativeEvents[eventName] : undefined;
  if (!portable && !legacy) throw new Error('Unsupported native agent hook event');
  const taskId = process.env.ATSYS_TASK_ID,
    attemptId = process.env.ATSYS_ATTEMPT_ID;
  const queued = store.update((s) => {
    const task = s.tasks.find((t) => t.id === taskId);
    const attempt = task?.attempts.find((a) => a.id === attemptId);
    if (
      !task ||
      !attempt ||
      !['starting', 'running'].includes(attempt.status) ||
      (providerFor(attempt.config, attempt.phase) !== provider &&
        !(
          attempt.phase === 'worker' &&
          attempt.config.worker === 'command' &&
          provider === 'codex'
        )) ||
      task.stopRequested
    )
      throw new Error('AtSys attempt is not active');
    if (hookId === '__atsys_probe__') {
      attempt.nativeHooksConnectedAt = stamp();
      taskEvent(
        task,
        'observer',
        `${provider}.hooks.connected`,
        `Native ${provider} hook bridge connected. Turn boundaries are not per-HTTP-request interception.`,
      );
      return null;
    }
    const hook = attempt.config.hooks.find(
      (h) =>
        h.id === hookId &&
        ((!!portable && h.events.includes(portable)) || (!!legacy && h.events.includes(legacy))),
    );
    if (!hook) throw new Error('Native hook is not authorized by this attempt snapshot');
    const event = portable && hook.events.includes(portable) ? portable : legacy!;
    if (hook.phases.length && !hook.phases.includes(attempt.phase)) return null;
    const id = [
      payload.session_id ?? payload.sessionId ?? '',
      payload.turn_id ?? payload.turnId ?? '',
      payload.tool_use_id ?? payload.toolCallId ?? payload.timestamp ?? randomUUID(),
      eventName,
    ].join(':');
    const snapshot = { ...attempt, config: { ...attempt.config, hooks: [hook] } };
    const ids = queueHooks(task, event, snapshot, `native:${attempt.id}:${id || randomUUID()}`, {
      provider,
      event: eventName,
      model: payload.model,
      sessionId: payload.session_id ?? payload.sessionId,
      turnId: payload.turn_id ?? payload.turnId,
      toolName: payload.tool_name ?? payload.toolName,
      toolCallId: payload.tool_use_id ?? payload.toolCallId,
      toolInput: payload.tool_input ?? payload.toolArgs,
      toolResult: payload.tool_response ?? payload.toolResult,
    });
    return ids[0]
      ? {
          id: ids[0],
          timeout: hook.timeoutSeconds + 8,
          failurePolicy: hook.failurePolicy,
          pausedMs: attempt.pausedMs ?? 0,
        }
      : null;
  });
  if (!queued) {
    console.log('{}');
    store.close();
    process.exit(0);
  }
  const deadline = Date.now() + queued.timeout * 1000;
  let response: object | undefined;
  while (true) {
    const task = store.read().tasks.find((t) => t.id === taskId);
    const receipt = task?.hookRuns?.find((r) => r.id === queued.id);
    const activeAttempt = task?.attempts.find((a) => a.id === attemptId);
    const pendingPause =
      task?.pauseState && !task.pauseState.resumeRequestedAt
        ? Date.now() - Date.parse(task.pauseState.requestedAt)
        : 0;
    if (Date.now() >= deadline + (activeAttempt?.pausedMs ?? 0) - queued.pausedMs + pendingPause)
      break;
    if (
      !task ||
      task.stopRequested ||
      task.attempts.find((a) => a.id === attemptId)?.status !== 'running'
    ) {
      response = deny('AtSys attempt stopped');
      break;
    }
    if (receipt?.applied) {
      const failed = receipt.status !== 'succeeded';
      const decision = receipt.result?.decision;
      response =
        decision === 'fail' ||
        decision === 'escalate' ||
        (failed && queued.failurePolicy === 'fail')
          ? deny(receipt.error ?? receipt.result?.message ?? 'AtSys hook denied this operation')
          : receipt.result?.message
            ? provider === 'copilot'
              ? { additionalContext: receipt.result.message }
              : { systemMessage: receipt.result.message }
            : {};
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(
    JSON.stringify(
      response ??
        (queued.failurePolicy === 'fail'
          ? deny('AtSys native hook did not finish within its deadline')
          : { systemMessage: 'AtSys native hook deadline exceeded' }),
    ),
  );
} catch {
  console.log(
    JSON.stringify(deny('AtSys native hook could not validate or deliver this callback')),
  );
} finally {
  store.close();
}
