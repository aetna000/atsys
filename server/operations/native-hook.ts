// Invoked by Codex's native hooks. No API/dashboard or transcript access is needed.
import { randomUUID } from 'node:crypto';
import { OperationsStore, stamp, taskEvent } from './store.js';
import { nativeEvents, codexHookConfig } from './codex-hooks.js';
import { queueHooks } from './hooks.js';
const hookId = process.argv[2];
let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
  if (Buffer.byteLength(input) > 64000) {
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
  eventName = payload.hook_event_name;
  const event = nativeEvents[eventName];
  if (!event) throw new Error('Unsupported native Codex hook event');
  const taskId = process.env.ATSYS_TASK_ID,
    attemptId = process.env.ATSYS_ATTEMPT_ID;
  const queued = store.update((s) => {
    const task = s.tasks.find((t) => t.id === taskId);
    const attempt = task?.attempts.find((a) => a.id === attemptId);
    if (
      !task ||
      !attempt ||
      !['starting', 'running'].includes(attempt.status) ||
      task.stopRequested
    )
      throw new Error('AtSys attempt is not active');
    if (hookId === '__atsys_probe__') {
      attempt.nativeHooksConnectedAt = stamp();
      taskEvent(
        task,
        'observer',
        'codex.hooks.connected',
        'Native Codex hook bridge connected. Turn boundaries are not per-HTTP-request interception.',
      );
      return null;
    }
    const hook = attempt.config.hooks.find((h) => h.id === hookId && h.events.includes(event));
    if (!hook) throw new Error('Native hook is not authorized by this attempt snapshot');
    if (hook.phases.length && !hook.phases.includes(attempt.phase)) return null;
    const id = [
      payload.session_id ?? '',
      payload.turn_id ?? '',
      payload.tool_use_id ?? eventName,
      eventName,
    ].join(':');
    const snapshot = { ...attempt, config: { ...attempt.config, hooks: [hook] } };
    const ids = queueHooks(task, event, snapshot, `native:${attempt.id}:${id || randomUUID()}`, {
      provider: 'codex',
      event: eventName,
      model: payload.model,
      sessionId: payload.session_id,
      turnId: payload.turn_id,
      toolName: payload.tool_name,
      toolCallId: payload.tool_use_id,
      toolInput: payload.tool_input,
      toolResult: payload.tool_response,
    });
    return ids[0]
      ? { id: ids[0], timeout: hook.timeoutSeconds + 8, failurePolicy: hook.failurePolicy }
      : null;
  });
  if (!queued) {
    console.log('{}');
    store.close();
    process.exit(0);
  }
  const deadline = Date.now() + queued.timeout * 1000;
  let response: object | undefined;
  while (Date.now() < deadline) {
    const task = store.read().tasks.find((t) => t.id === taskId);
    const receipt = task?.hookRuns?.find((r) => r.id === queued.id);
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
            ? { systemMessage: receipt.result.message }
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
