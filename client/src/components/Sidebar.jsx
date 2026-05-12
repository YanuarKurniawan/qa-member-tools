import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Wrench } from 'lucide-react';

export default function Sidebar({ categories = [] }) {
  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-slate-300 hover:bg-sidebar-hover hover:text-white'
    }`;

  return (
    <aside className="flex w-64 flex-col bg-sidebar text-white">
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
        <NavLink to="/" end className={linkClass}>
          <LayoutDashboard size={18} />
          Dashboard
        </NavLink>

        <div className="pb-1 pt-4">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Tools
          </p>
        </div>

        {categories.map((cat) => {
          const Icon = cat.icon || Wrench;
          return (
            <NavLink key={cat.id} to={`/${cat.id}`} className={linkClass}>
              <Icon size={18} />
              {cat.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-slate-700 px-5 py-4">
        <p className="text-xs text-slate-500">v2.0.0</p>
      </div>
    </aside>
  );
}
