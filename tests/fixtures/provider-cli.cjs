const fs = require('fs'),
  path = require('path'),
  cp = require('child_process');
const provider = path.basename(process.argv[1]),
  args = process.argv.slice(2),
  role = process.env.ATSYS_ATTEMPT_PHASE;
let prompt = '';
process.stdin.on('data', (b) => (prompt += b));
process.stdin.on('end', () => {
  const mode = JSON.parse(fs.readFileSync('fixture-mode.json', 'utf8'));
  fs.writeFileSync(
    `seen-${provider}-${role}.json`,
    JSON.stringify({ provider, role, args, prompt }),
  );
  function output(value) {
    if (provider === 'codex') {
      fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], JSON.stringify(value));
      return;
    }
    console.log(
      JSON.stringify(
        provider === 'claude'
          ? {
              type: 'result',
              subtype: 'success',
              structured_output: value,
              result: JSON.stringify(value),
            }
          : { type: 'assistant.message', data: { content: JSON.stringify(value) } },
      ),
    );
  }
  if (mode.hooks && role === 'worker') {
    let hooks;
    if (provider === 'claude') hooks = JSON.parse(args[args.indexOf('--settings') + 1]).hooks;
    else
      hooks = JSON.parse(
        fs.readFileSync(path.join(args[args.indexOf('--plugin-dir') + 1], 'hooks.json'), 'utf8'),
      ).hooks;
    for (const event of provider === 'claude'
      ? ['SessionStart', 'PreToolUse', 'PostToolUse']
      : ['sessionStart', 'preToolUse', 'postToolUse']) {
      for (const group of hooks[event] ?? []) {
        const h = provider === 'claude' ? group.hooks[0] : group;
        const payload =
          provider === 'claude'
            ? {
                hook_event_name: event,
                session_id: 'fixture',
                tool_use_id: 'call',
                tool_name: 'Read',
                tool_input: { file_path: 'fixture-mode.json' },
              }
            : {
                sessionId: 'fixture',
                toolCallId: 'call',
                toolName: 'view',
                toolArgs: '{"path":"fixture-mode.json"}',
              };
        const r = h.exec
          ? cp.spawnSync(h.exec, h.args, {
              input: JSON.stringify(payload),
              encoding: 'utf8',
              env: process.env,
            })
          : cp.spawnSync('/bin/sh', ['-c', h.command], {
              input: JSON.stringify(payload),
              encoding: 'utf8',
              env: process.env,
            });
        if (r.status !== 0) process.exit(9);
        const reply = JSON.parse(r.stdout || '{}');
        if (
          reply.permissionDecision === 'deny' ||
          reply.hookSpecificOutput?.permissionDecision === 'deny'
        )
          process.exit(8);
      }
    }
  }
  if (role === 'supervisor')
    return output(
      mode.malformed
        ? { action: 'complete' }
        : {
            action: 'repair',
            reason: 'Fixture failure requires a scoped fix',
            instructions: 'Create repaired marker and retry',
            blocker: null,
          },
    );
  if (role === 'repair') {
    fs.writeFileSync('repaired', 'fixed');
    return output({ fixed: true, summary: 'Repaired fixture and checked marker' });
  }
  if (role === 'worker' && mode.capacityModels?.includes(args[args.indexOf('--model') + 1])) {
    const event = provider === 'codex'
      ? { type: 'turn.failed', error: { message: 'Selected model is at capacity. Please try a different model.' } }
      : provider === 'claude'
        ? { type: 'result', is_error: true, subtype: 'error_during_execution', result: 'Model is at capacity' }
        : { type: 'session.error', data: { errorType: 'model_unavailable', message: 'Model is at capacity' } };
    console.log(JSON.stringify(event));
    process.exit(1);
  }
  if (mode.error) {
    console.log(
      JSON.stringify(
        provider === 'claude'
          ? { type: 'result', subtype: 'error_max_turns', is_error: true }
          : { type: 'session.error', data: { message: 'fixture failure' } },
      ),
    );
    return;
  }
  if (mode.recovery && !fs.existsSync('repaired')) process.exit(7);
  if (mode.quiet)
    return setInterval(() => {
      fs.writeFileSync('ticks', String(Date.now()));
    }, 100);
  fs.writeFileSync('feature.txt', 'implemented');
  fs.writeFileSync(
    'progress.json',
    JSON.stringify({
      completed: 3,
      total: 3,
      milestones: ['Inspect', 'Implement', 'Check'],
      planSource: 'Fixture goal contract',
      checkpoint: 'checked',
    }),
  );
  fs.writeFileSync(
    'outcome.json',
    JSON.stringify({
      version: 1,
      summary: 'Implemented fixture',
      results: [
        { name: 'Feature', status: 'passed', detail: 'Checked file', evidence: ['feature.txt'] },
      ],
      limitations: [],
    }),
  );
  console.log(
    JSON.stringify(
      provider === 'claude'
        ? {
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'Fixture implemented' }] },
          }
        : { type: 'assistant.message', data: { content: 'Fixture implemented' } },
    ),
  );
  if (provider === 'claude')
    console.log(JSON.stringify({ type: 'result', subtype: 'success', result: 'Done' }));
});
