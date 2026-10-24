import { useState } from 'react';
import { Alert, Button, MenuItem, Switch, TextField } from '@mui/material';
import { ArrowUpRight, Check, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { api, useConsole } from '../api';
import type { Diagnostic, Settings as SettingsType } from '../../shared/types';
import { Badge, PageTitle, Panel, timestamp } from '../components/common';
import { VERSION } from '../../shared/version';
export function Settings() {
  const c = useConsole();
  const [form, setForm] = useState<SettingsType>(c.state.settings);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(c.state.settings);
  async function save() {
    setBusy(true);
    await c.perform(() => api('/settings', form, 'PATCH'), 'Guardrails saved');
    setBusy(false);
  }
  async function check() {
    setChecking(true);
    const d = await c.perform(
      () => api<Diagnostic[]>('/doctor'),
      'Provider executables checked; credentials were not read',
    );
    if (d) setDiagnostics(d);
    setChecking(false);
  }
  return (
    <>
      <PageTitle
        eyebrow="EXPLICIT BOUNDARIES. PREDICTABLE BEHAVIOR."
        title="Settings"
        description="Configure the local control plane and inspect effective runtime support."
        action={
          <Button
            variant="contained"
            startIcon={<Save size={15} />}
            disabled={
              busy ||
              !dirty ||
              form.dailyBudget <= 0 ||
              form.retryLimit < 0 ||
              form.retryLimit > 5 ||
              form.staleAfterSeconds < 10
            }
            onClick={save}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        }
      />
      <div className="two-columns">
        <Panel title="Recovery guardrails" action={<ShieldCheck size={16} />}>
          <div className="settings-form">
            <TextField
              label="Daily budget (USD)"
              type="number"
              fullWidth
              value={form.dailyBudget}
              onChange={(e) => setForm({ ...form, dailyBudget: Number(e.target.value) })}
              helperText="A future call ceiling; cannot reverse provider-side charges."
            />
            <TextField
              label="Maximum checkpoint recovery attempts"
              type="number"
              fullWidth
              value={form.retryLimit}
              onChange={(e) => setForm({ ...form, retryLimit: Number(e.target.value) })}
              helperText="0–5 attempts. The policy gate checks the exact target."
            />
            <TextField
              label="Stale heartbeat threshold (seconds)"
              type="number"
              fullWidth
              value={form.staleAfterSeconds}
              onChange={(e) => setForm({ ...form, staleAfterSeconds: Number(e.target.value) })}
              helperText="10–3600 seconds. Stale does not imply a known failure cause."
            />
            <TextField
              select
              label="Recovery policy"
              fullWidth
              value={form.recoveryMode}
              onChange={(e) =>
                setForm({ ...form, recoveryMode: e.target.value as SettingsType['recoveryMode'] })
              }
            >
              <MenuItem value="observe_only">Observe only · human review</MenuItem>
              <MenuItem value="allowlisted">Allowlisted · bounded policy</MenuItem>
            </TextField>
            <Alert severity="info">
              This milestone routes every recovery through human review. Automatic allowlist
              execution remains disabled until a production adapter implements verification.
            </Alert>
          </div>
        </Panel>
        <Panel title="Notifications & integrations">
          <div className="settings-form">
            <div className="switch-row">
              <div>
                <strong>In-app incident center</strong>
                <p>Incidents always remain in the durable record.</p>
              </div>
              <Switch
                checked
                disabled
                inputProps={{ 'aria-label': 'In-app incident recording always enabled' }}
              />
            </div>
            <div className="switch-row">
              <div>
                <strong>Attention badges</strong>
                <p>Show incident and approval counts in navigation.</p>
              </div>
              <Switch
                checked={form.notifications}
                onChange={(_, checked) => setForm({ ...form, notifications: checked })}
                inputProps={{ 'aria-label': 'Attention badges' }}
              />
            </div>
            <div className="switch-row">
              <div>
                <strong>Sound alerts</strong>
                <p>Off · browser permission flow not implemented.</p>
              </div>
              <Badge value="unavailable" />
            </div>
            <div className="switch-row">
              <div>
                <strong>Telegram notifications</strong>
                <p>Off · no bot token or routing configured.</p>
              </div>
              <Badge value="unavailable" />
            </div>
            <div className="switch-row">
              <div>
                <strong>AtMem / AtFlows / AtBot</strong>
                <p>Off by default. No source data is sent.</p>
              </div>
              <span className="off-pill">Off</span>
            </div>
            <Alert severity="info">
              Local-only mode binds to loopback. Remote/team access requires a future authenticated
              deployment.
            </Alert>
          </div>
        </Panel>
      </div>
      <Panel
        title="Runtime adapter doctor"
        action={
          <Button
            size="small"
            disabled={checking}
            onClick={check}
            startIcon={<RefreshCw size={13} />}
          >
            {checking ? 'Checking…' : 'Check providers'}
          </Button>
        }
      >
        <div className="integration-body">
          <p className="muted">
            Checks actual executable availability on PATH. Installation does not imply
            authentication, protocol support or an implemented adapter.
          </p>
          {diagnostics ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Executable</th>
                    <th>AtSys support</th>
                    <th>Capability assessment</th>
                    <th>Checked</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnostics.map((d) => (
                    <tr key={d.runtime}>
                      <td>
                        <strong>{d.label}</strong>
                      </td>
                      <td>
                        {d.installed ? (
                          <span className="success-text">
                            <Check size={12} />
                            Detected
                          </span>
                        ) : (
                          'Not installed'
                        )}
                        <small className="mono">{d.path ?? 'Not found on PATH'}</small>
                      </td>
                      <td>
                        <Badge value="unavailable" />
                      </td>
                      <td>{d.note}</td>
                      <td>{timestamp(d.checkedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="subtle-box">
              <strong>No inspection has been run</strong>
              <p>
                Use Check providers to inspect local executables without reading credentials or
                starting agent sessions.
              </p>
            </div>
          )}
        </div>
      </Panel>
      <Panel title="About this build">
        <div className="integration-body">
          <div className="two-columns">
            <div>
              <h3>AtSys {VERSION} · local supervision</h3>
              <p>
                React + Material UI · SQLite durable state · provider-neutral roles. Simulated
                sessions are labeled and never invoke a paid model.
              </p>
              <p className="muted">
                See README.md, the Spec Kit feature and docs/ROADMAP.md for implementation
                boundaries.
              </p>
            </div>
            <div>
              <h3>Open-source acknowledgements</h3>
              <p>
                Status labels are adapted from Headlamp, licensed under Apache 2.0. The resource
                console is inspired by its navigation and evidence-first patterns.
              </p>
              <div className="button-row">
                <a href="/licenses/headlamp-LICENSE.txt" target="_blank" rel="noreferrer">
                  Headlamp license <ArrowUpRight size={12} />
                </a>
                <a href="/licenses/headlamp-NOTICE.txt" target="_blank" rel="noreferrer">
                  Notice <ArrowUpRight size={12} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </Panel>
    </>
  );
}
