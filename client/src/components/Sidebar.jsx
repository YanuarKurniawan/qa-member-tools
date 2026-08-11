import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Wrench, Menu, X, GitCompare, ClipboardCheck } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';

export default function Sidebar({ categories = [] }) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef(null);
  const triggerRef = useRef(null);

  const trapFocus = useCallback((e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key !== 'Tab') return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    const focusable = drawer.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', trapFocus);
    const firstLink = drawerRef.current?.querySelector('a[href], button');
    firstLink?.focus();
    return () => document.removeEventListener('keydown', trapFocus);
  }, [open, trapFocus]);

  useEffect(() => {
    if (!open) triggerRef.current?.focus();
  }, [open]);

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-slate-300 hover:bg-sidebar-hover hover:text-white'
    }`;

  const nav = (
    <>
      <div className="flex items-center gap-3 border-b border-slate-700 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
          <Wrench size={20} />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight">QA Tools</h1>
          <p className="text-xs text-slate-400">Member Services</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <NavLink to="/" end className={linkClass} onClick={() => setOpen(false)}>
          <LayoutDashboard size={18} />
          Dashboard
        </NavLink>

        <div className="pb-1 pt-4">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Dashboards
          </p>
        </div>

        <NavLink to="/automation-web" className={linkClass} onClick={() => setOpen(false)}>
          <GitCompare size={18} />
          Automation WEB
        </NavLink>

        <NavLink to="/test-runner" className={linkClass} onClick={() => setOpen(false)}>
          <ClipboardCheck size={18} />
          Test Runner
        </NavLink>

        <div className="pb-1 pt-4">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Tools
          </p>
        </div>

        {categories.map((cat) => {
          const Icon = cat.icon || Wrench;
          return (
            <NavLink key={cat.id} to={`/${cat.id}`} className={linkClass} onClick={() => setOpen(false)}>
              <Icon size={18} />
              {cat.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-slate-700 px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">v2.0.0</p>
          <kbd className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
            {navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl+'}K
          </kbd>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-lg bg-sidebar text-white shadow-lg transition-colors hover:bg-sidebar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>

      <aside className="hidden w-64 flex-col bg-sidebar text-white lg:flex">
        {nav}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside ref={drawerRef} className="relative flex h-full w-64 flex-col bg-sidebar text-white shadow-2xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-sidebar-hover hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
