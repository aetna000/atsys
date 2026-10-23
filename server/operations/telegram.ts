import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { OperationsStore, stamp, uid } from './store.js';
import { DomainError } from '../control-plane.js';
export function configureTelegram(store: OperationsStore, input: unknown) {
  const c = z
    .object({
      enabled: z.boolean(),
      chatId: z
        .string()
        .max(100)
        .regex(/^(-?\d+|@[a-zA-Z0-9_]+)?$/),
      token: z.string().max(300).optional(),
      onIncident: z.boolean(),
      onRecovery: z.boolean(),
      onCompletion: z.boolean(),
      maxAttempts: z.number().int().min(1).max(10),
    })
    .strict()
    .parse(input);
  const secretPath = join(store.directory, 'telegram-secret.json');
  if (c.token) {
    if (!/^\d+:[a-zA-Z0-9_-]{20,}$/.test(c.token))
      throw new DomainError('Invalid Telegram bot token format', 400);
    const temporary = `${secretPath}.${uid('write')}`;
    writeFileSync(temporary, JSON.stringify({ token: c.token }), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, secretPath);
    chmodSync(secretPath, 0o600);
  }
  const hasToken = existsSync(secretPath);
  if (c.enabled && (!hasToken || !c.chatId))
    throw new DomainError('Telegram requires a bot token and chat ID', 400);
  return store.update((s) => {
    s.telegram = {
      enabled: c.enabled,
      chatId: c.chatId,
      hasToken,
      onIncident: c.onIncident,
      onRecovery: c.onRecovery,
      onCompletion: c.onCompletion,
      maxAttempts: c.maxAttempts,
    };
    return s.telegram;
  });
}
export function queueTestMessage(store: OperationsStore) {
  return store.update((s) => {
    if (!s.telegram.enabled || !s.telegram.hasToken || !s.telegram.chatId)
      throw new DomainError('Configure and enable Telegram first');
    const id = uid('msg');
    s.deliveries.unshift({
      id,
      key: id,
      taskId: '',
      text: 'AtSys test notification · your task supervision channel is connected.',
      status: 'pending',
      attempts: 0,
      nextAt: stamp(),
      createdAt: stamp(),
    });
    return { id, status: 'pending' };
  });
}
export async function deliverNext(
  store: OperationsStore,
  owner: string,
  request: typeof fetch = fetch,
) {
  const claimed = store.update((s) => {
    if (s.daemon?.owner !== owner || !s.telegram.enabled) return null;
    const d = s.deliveries.find(
      (d) => ['pending', 'sending'].includes(d.status) && Date.parse(d.nextAt) <= Date.now(),
    );
    if (!d) return null;
    if (d.attempts >= s.telegram.maxAttempts) {
      d.status = 'failed';
      d.error = 'Delivery attempt budget exhausted';
      return null;
    }
    d.status = 'sending';
    d.attempts++;
    d.nextAt = new Date(Date.now() + 30000).toISOString();
    return { delivery: d, chatId: s.telegram.chatId, max: s.telegram.maxAttempts };
  });
  if (!claimed) return;
  let failure: string | undefined;
  let retryAfter = 0;
  try {
    const { token } = JSON.parse(
      readFileSync(join(store.directory, 'telegram-secret.json'), 'utf8'),
    ) as { token: string };
    const response = await request(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: claimed.chatId, text: claimed.delivery.text }),
      signal: AbortSignal.timeout(10000),
    });
    const result = (await response.json()) as {
      ok?: boolean;
      parameters?: { retry_after?: number };
    };
    if (!response.ok || !result.ok) {
      failure = `Telegram rejected delivery (HTTP ${response.status})`;
      retryAfter = Math.min(86400, Math.max(0, result.parameters?.retry_after ?? 0));
    }
  } catch {
    failure = 'Telegram request failed or timed out. Check network and credentials.';
  }
  store.update((s) => {
    const d = s.deliveries.find((d) => d.id === claimed.delivery.id);
    if (!d || d.status !== 'sending' || d.attempts !== claimed.delivery.attempts) return;
    if (!failure) {
      d.status = 'sent';
      d.sentAt = stamp();
      d.error = undefined;
    } else {
      d.error = failure;
      d.status = d.attempts >= claimed.max ? 'failed' : 'pending';
      d.nextAt = new Date(
        Date.now() + Math.max(retryAfter * 1000, Math.min(300000, 1000 * 2 ** d.attempts)),
      ).toISOString();
    }
  });
}
