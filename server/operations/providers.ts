import { codexInvocation, codingPrompt, proposalSchema, repairSchema } from './codex.js';
import { providerFor } from '../../shared/providers.js';
import type { Attempt, ManagedTask } from '../../shared/operations.js';
import { providerHookArgs } from './provider-hooks.js';

export function agentInvocation(
  task: ManagedTask,
  attempt: Attempt,
  schemaPath: string,
  resultPath: string,
  directory: string,
) {
  const c = attempt.config;
  const provider = providerFor(c, attempt.phase);
  if (!provider) throw new Error('No coding provider for this phase');
  if (provider === 'codex')
    return { ...codexInvocation(task, attempt, schemaPath, resultPath), provider };
  const readonly = attempt.phase === 'supervisor';
  if (!readonly && !c.trustedLocalExecution)
    throw new Error(`${provider} local tool execution was not authorized`);
  const model =
    attempt.phase === 'worker'
      ? c.model
      : attempt.phase === 'repair'
        ? c.repairModel?.trim() || c.supervisorModel
        : c.supervisorModel;
  const effort =
    attempt.phase === 'worker'
      ? c.reasoningEffort
      : attempt.phase === 'repair'
        ? (c.repairEffort ?? c.supervisorEffort)
        : c.supervisorEffort;
  const scoped = {
    ...c,
    hooks: c.hooks.filter((h) => !h.phases.length || h.phases.includes(attempt.phase)),
  };
  let prompt = codingPrompt(task, attempt);
  if (attempt.phase !== 'worker')
    prompt += `\nReturn ONLY JSON matching this schema: ${JSON.stringify(attempt.phase === 'repair' ? repairSchema : proposalSchema)}. No Markdown fences or surrounding explanation.`;
  const claudeTools = readonly
    ? 'Read,Glob,Grep'
    : 'Read,Glob,Grep,Edit,Write,Bash' + (c.networkAccess ? ',WebFetch,WebSearch' : '');
  const copilotTools = readonly
    ? 'view,glob,grep'
    : 'view,glob,grep,create,edit,apply_patch,bash' +
      (c.networkAccess ? ',web_fetch,web_search' : '');
  const argv =
    provider === 'claude'
      ? [
          'claude',
          '--print',
          '--verbose',
          '--output-format',
          'stream-json',
          '--permission-mode',
          'dontAsk',
          '--strict-mcp-config',
          '--mcp-config',
          '{"mcpServers":{}}',
          '--setting-sources',
          '',
          '--tools',
          claudeTools,
          '--allowedTools',
          claudeTools,
          '--effort',
          effort,
        ]
      : [
          'copilot',
          '--no-auto-update',
          '--no-ask-user',
          '--no-color',
          '--output-format',
          'json',
          '--disable-builtin-mcps',
          '--additional-mcp-config',
          '{"mcpServers":{}}',
          '--available-tools',
          copilotTools,
          '--allow-tool',
          'read',
        ];
  // Copilot's auto router rejects explicit reasoning effort. Only send it
  // with an explicitly selected model; otherwise keep native routing defaults.
  if (provider === 'copilot' && model.trim() && model.trim() !== 'auto')
    argv.push('--reasoning-effort', effort);
  if (provider === 'copilot' && !readonly && c.networkAccess) argv.push('--allow-url', '*');
  if (provider === 'copilot' && !readonly)
    argv.push('--allow-tool', 'write', '--allow-tool', 'shell');
  if (readonly)
    argv.push(provider === 'claude' ? '--disable-slash-commands' : '--no-custom-instructions');
  if (provider === 'claude' && attempt.phase !== 'worker')
    argv.push(
      '--json-schema',
      JSON.stringify(attempt.phase === 'repair' ? repairSchema : proposalSchema),
    );
  if (model.trim()) argv.push('--model', model.trim());
  argv.push(...providerHookArgs(provider, scoped, directory));
  // Both CLIs accept piped stdin as a non-interactive prompt. Keep task evidence
  // out of process-list argv, just as with Codex's stdin prompt.
  return { argv, prompt, provider };
}

export class ProviderResult {
  private final: string | undefined;
  private structured: unknown;
  private error: string | undefined;
  private completed = false;
  private capacity = false;
  private terminalCapacity = false;
  constructor(private provider: string) {}
  feed(line: string) {
    let row: any;
    try {
      row = JSON.parse(line);
    } catch {
      return;
    }
    if (this.provider === 'codex') {
      const message =
        row.type === 'turn.failed'
          ? row.error?.message
          : row.type === 'error'
            ? row.message
            : undefined;
      if (typeof message === 'string' && /selected model is at capacity/i.test(message)) {
        this.capacity = true;
        if (row.type === 'turn.failed') this.terminalCapacity = true;
      }
      return;
    }
    // Only inspect provider error records, never ordinary assistant or tool text.
    // Generic rate limits and quota errors are intentionally not model capacity.
    const errorRecord =
      (this.provider === 'claude' &&
        (row.type === 'error' || (row.type === 'result' && row.is_error))) ||
      (this.provider === 'copilot' && row.type === 'session.error');
    if (errorRecord) {
      const errorType = this.provider === 'claude' ? row.error?.type : row.data?.errorType;
      const message =
        this.provider === 'claude' ? (row.error?.message ?? row.result) : row.data?.message;
      if (
        errorType === 'overloaded_error' ||
        (typeof message === 'string' &&
          /(?:model (?:is |currently )?(?:at capacity|overloaded)|selected model is at capacity)/i.test(
            message,
          ))
      ) {
        this.capacity = true;
        this.terminalCapacity = true;
      }
    }
    if (row.is_error || row.type === 'session.error' || row.type === 'error')
      this.error = 'Provider reported an execution error';
    if (this.provider === 'claude' && row.type === 'result') {
      this.completed = true;
      if (row.subtype && row.subtype !== 'success') this.error = `Claude result: ${row.subtype}`;
      this.final = row.result;
      this.structured = row.structured_output;
    }
    if (
      this.provider === 'copilot' &&
      row.type === 'assistant.message' &&
      !row.data?.parentToolCallId
    ) {
      this.completed = true;
      this.final = row.data?.content;
    }
  }
  capacityFailure(exitCode: number | null = 1) {
    return this.terminalCapacity || (exitCode !== 0 && this.capacity);
  }
  result() {
    if (this.error) throw new Error(this.error);
    if (this.structured !== undefined) return this.structured;
    if (typeof this.final !== 'string' || Buffer.byteLength(this.final) > 64000)
      throw new Error('Missing or oversized structured provider response');
    return JSON.parse(this.final);
  }
  check() {
    if (this.error) throw new Error(this.error);
    if (['claude', 'copilot'].includes(this.provider) && !this.completed)
      throw new Error('Missing provider completion receipt');
  }
}
