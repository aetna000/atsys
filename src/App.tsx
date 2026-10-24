import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  CssBaseline,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  ThemeProvider,
} from '@mui/material';
import {
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  Menu,
  Moon,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { makeTheme } from './theme';
import { VERSION } from '../shared/version';
import { Tasks } from './pages/Tasks';
export default function App() {
  const [search, setSearch] = useState('');
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('atsys-dark') === 'true');
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const settings = location.pathname === '/settings';
  const taskList = location.pathname === '/' || location.pathname === '/tasks';
  const theme = useMemo(() => makeTheme(dark), [dark]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('atsys-dark', String(dark));
  }, [dark]);
  useEffect(() => {
    setMobile(false);
    setSearch('');
  }, [location.pathname]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && searchRef.current) {
        e.preventDefault();
        searchRef.current.focus();
      }
      if (e.key === 'Escape') {
        setMobile(false);
        setHelp(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const notify = (text: string, error = false) => setToast({ text, error });
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {mobile && (
          <button
            className="sidebar-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <aside className={`sidebar ${mobile ? 'open' : ''}`}>
          <Link to="/" className="brand">
            <div className="brand-symbol">
              <span />Λ
            </div>
            <div>
              AtSys<span>AGENT CONTROL PLANE</span>
            </div>
            <span className="version">v{VERSION}</span>
          </Link>
          <div className="workspace-label">
            <div className="workspace-avatar">L</div>
            <div>
              <strong>Local workspace</strong>
              <span>Personal · single operator</span>
            </div>
          </div>
          <nav aria-label="Main navigation">
            <div className="nav-group">
              <div className="nav-group-title">WORKSPACE</div>
              <NavLink to="/" className={() => (!settings ? 'active' : undefined)}>
                <ShieldCheck size={17} />
                <span>Managed tasks</span>
              </NavLink>
              <NavLink to="/settings">
                <SettingsIcon size={17} />
                <span>Service & alerts</span>
              </NavLink>
            </div>
          </nav>
          <div className="sidebar-bottom">
            <div className="local-note">
              <div>
                <span className="tiny-dot" />
                LOCAL TASK SUPERVISION
              </div>
              <p>
                Execution, validation and recovery
                <br />
                continue independently of this view.
              </p>
              <a
                href="https://github.com/kubernetes-sigs/headlamp"
                target="_blank"
                rel="noreferrer"
              >
                Headlamp acknowledgements <ArrowUpRight size={12} />
              </a>
            </div>
            <button className="operator" onClick={() => setHelp(true)}>
              <CircleHelp size={18} />
              <span>
                <strong>Help & shortcuts</strong>
                <small>Tasks, hooks and supervision</small>
              </span>
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <IconButton
              className="mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </IconButton>
            <div className="breadcrumb">
              <span>Workspace</span>
              <ChevronRight size={13} />
              <strong>{settings ? 'Service & alerts' : 'Managed tasks'}</strong>
            </div>
            {taskList && (
              <div className="global-search">
                <Search size={15} />
                <input
                  ref={searchRef}
                  aria-label="Search managed tasks"
                  placeholder="Search tasks…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <kbd>⌘ K</kbd>
              </div>
            )}
            <div className="header-actions">
              <IconButton
                aria-label={dark ? 'Use light theme' : 'Use dark theme'}
                onClick={() => setDark(!dark)}
              >
                {dark ? <Sun size={17} /> : <Moon size={17} />}
              </IconButton>
            </div>
          </header>
          <main id="main-content">
            <Routes>
              <Route path="/" element={<Tasks search={search} notify={notify} />} />
              <Route path="/tasks" element={<Tasks search={search} notify={notify} />} />
              <Route path="/tasks/:taskId" element={<Tasks search="" notify={notify} />} />
              <Route path="/settings" element={<Tasks search="" notify={notify} settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <footer className="app-footer">
              <span>
                <span className="tiny-dot" />
                AtSys · local task supervision
              </span>
              <button onClick={() => setHelp(true)}>
                Help & shortcuts <CircleHelp size={12} />
              </button>
            </footer>
          </main>
        </div>
        <Snackbar
          open={!!toast}
          autoHideDuration={5000}
          onClose={() => setToast(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert severity={toast?.error ? 'error' : 'success'} onClose={() => setToast(null)}>
            {toast?.text}
          </Alert>
        </Snackbar>
        <Dialog open={help} onClose={() => setHelp(false)} fullWidth maxWidth="sm">
          <DialogTitle>
            Using AtSys
            <IconButton
              sx={{ float: 'right' }}
              aria-label="Close help"
              onClick={() => setHelp(false)}
            >
              <X size={18} />
            </IconButton>
          </DialogTitle>
          <DialogContent>
            <p>
              Create a managed task with an objective, worker, independent acceptance checks and
              bounded recovery. Use task wiring to configure models, deadlines and optional hooks.
            </p>
            <p>
              Activity shows newest messages first. Filter by attempt or text; raw provider output
              remains an explicit technical view.
            </p>
            <p>
              Configure the watchdog service and Telegram under Service & alerts. Closing this
              dashboard does not stop tasks; sleep or power loss suspends local execution.
            </p>
            <p>
              <kbd>⌘ / Ctrl K</kbd> Search the task list · <kbd>Esc</kbd> Close navigation
            </p>
            <p>
              <a href="/licenses/headlamp-LICENSE.txt" target="_blank" rel="noreferrer">
                Headlamp license
              </a>{' '}
              ·{' '}
              <a href="/licenses/headlamp-NOTICE.txt" target="_blank" rel="noreferrer">
                Notice
              </a>
            </p>
            <Button onClick={() => setHelp(false)}>Close</Button>
          </DialogContent>
        </Dialog>
      </div>
    </ThemeProvider>
  );
}
