import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { State } from '../shared/types';
export async function api<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(
    `/api${path}`,
    body !== undefined
      ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : undefined,
  );
  if (!response.ok) {
    const result = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(result.error ?? 'Request failed');
  }
  return response.json();
}
export function useControlPlane() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const s = await api<State>('/state');
      setState(s);
      setError(null);
      setUpdated(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'API unavailable');
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [refresh]);
  return { state, error, updated, refresh };
}
export interface ConsoleContext {
  state: State;
  projectId: string;
  selectProject: (id: string) => void;
  online: boolean;
  search: string;
  range: number;
  refresh: () => Promise<void>;
  notify: (message: string, error?: boolean) => void;
  perform: <T>(fn: () => Promise<T>, message?: string) => Promise<T | undefined>;
}
export const Context = createContext<ConsoleContext | null>(null);
export function useConsole() {
  const value = useContext(Context);
  if (!value) throw new Error('Console context required');
  return value;
}
export const projectRuns = (state: State, projectId: string) =>
  state.runs.filter((r) => projectId === 'all' || r.projectId === projectId);
