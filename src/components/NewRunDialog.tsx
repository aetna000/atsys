import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Step,
  StepLabel,
  Stepper,
  TextField,
} from '@mui/material';
import { ArrowRight, FlaskConical, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useConsole, api } from '../api';
import { RUNTIMES, runtimeLabel, type Run } from '../../shared/types';
export function NewRunDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useConsole();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [project, setProject] = useState(
    c.projectId === 'all' ? c.state.projects[0]?.id : c.projectId,
  );
  const [runtime, setRuntime] = useState('codex');
  const [name, setName] = useState('Retrieval quality · evaluation');
  const [objective, setObjective] = useState(
    'Evaluate 100 cases and require a complete result artifact with accuracy ≥ 0.80.',
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setProject(c.projectId === 'all' ? c.state.projects[0]?.id : c.projectId);
  }, [open, c.projectId]);
  async function start() {
    setBusy(true);
    const r = await c.perform(
      () => api<Run>('/runs', { projectId: project, runtime, name, objective }),
      'Simulated run started',
    );
    setBusy(false);
    if (r) {
      c.selectProject(r.projectId);
      onClose();
      setStep(0);
      navigate(`/runs/${r.id}`);
    }
  }
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <span className="dialog-icon">
          <Play size={17} />
        </span>
        Start a supervised run
      </DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ my: 2, mb: 4 }}>
          {['Project', 'Coding agent', 'Task'].map((s) => (
            <Step key={s}>
              <StepLabel>{s}</StepLabel>
            </Step>
          ))}
        </Stepper>
        <Alert icon={<FlaskConical size={20} />} severity="info" sx={{ mb: 3 }}>
          Simulation workspace. Provider names are illustrative; no coding agent or paid model will
          be invoked.
        </Alert>
        {step === 0 && (
          <>
            <h3>Where are we working?</h3>
            <p className="muted">Choose a project. Source and provider settings stay untouched.</p>
            <TextField
              fullWidth
              select
              label="Project"
              value={project ?? ''}
              onChange={(e) => setProject(e.target.value)}
              sx={{ mt: 2 }}
            >
              {c.state.projects.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name} · {p.branch}
                </MenuItem>
              ))}
            </TextField>
          </>
        )}
        {step === 1 && (
          <>
            <h3>Choose the worker runtime</h3>
            <p className="muted">
              Roles are provider-independent. This run uses the AtSys simulator.
            </p>
            <div className="runtime-options">
              {RUNTIMES.map((r) => (
                <button
                  className={runtime === r ? 'selected' : ''}
                  key={r}
                  onClick={() => setRuntime(r)}
                >
                  <strong>{runtimeLabel(r)}</strong>
                  <span>Simulated adapter</span>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 2 && (
          <div className="form-stack">
            <TextField
              label="Task name"
              fullWidth
              value={name}
              onChange={(e) => setName(e.target.value)}
              inputProps={{ maxLength: 120 }}
            />
            <TextField
              label="Objective & completion checks"
              fullWidth
              multiline
              minRows={3}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              inputProps={{ maxLength: 3000 }}
            />
            <div className="subtle-box">
              <strong>Declared validator</strong>
              <p>100 / 100 cases complete · accuracy ≥ 0.80 · results.json with SHA-256 digest</p>
              <span className="muted">
                Timeout 1 hour · manual recovery approval · bounded retries
              </span>
            </div>
          </div>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 3 }}>
        <Button
          color="inherit"
          onClick={step === 0 ? onClose : () => setStep(step - 1)}
          disabled={busy}
        >
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        <Button
          variant="contained"
          endIcon={step < 2 ? <ArrowRight size={15} /> : <Play size={15} />}
          disabled={
            busy || !project || (step === 2 && (!name.trim() || objective.trim().length < 3))
          }
          onClick={step < 2 ? () => setStep(step + 1) : start}
        >
          {busy ? 'Starting…' : step < 2 ? 'Continue' : 'Start simulation'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
