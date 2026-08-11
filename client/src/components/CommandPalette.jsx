import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Wrench, ArrowRight } from 'lucide-react';

export default function CommandPalette({ categories = [] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();

  const allTools = useMemo(() => {
    const tools = [];
    for (const cat of categories) {
      for (const tool of cat.tools) {
        tools.push({ ...tool, categoryId: cat.id, categoryLabel: cat.label, categoryIcon: cat.icon });
      }
    }
    return tools;
  }, [categories]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allTools;
    const q = query.toLowerCase();
    return allTools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.categoryLabel.toLowerCase().includes(q)
    );
  }, [query, allTools]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.children[selected];
    item?.scrollIntoView({ block: 'nearest' });
  }, [selected, open]);

  const pick = (tool) => {
    setOpen(false);
    navigate(`/${tool.categoryId}?tool=${tool.id}`);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && filtered[selected]) {
      e.preventDefault();
      pick(filtered[selected]);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label="Search tools"
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-4">
          <Search size={18} className="shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search tools..."
            className="h-12 w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
            aria-activedescendant={filtered[selected] ? `cmd-${filtered[selected].id}` : undefined}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            aria-autocomplete="list"
          />
          <kbd className="hidden shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 sm:inline-block">
            ESC
          </kbd>
        </div>

        <ul
          id="cmd-list"
          ref={listRef}
          role="listbox"
          className="max-h-72 overflow-y-auto py-2"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-gray-500">
              No tools match "{query}"
            </li>
          ) : (
            filtered.map((tool, i) => {
              const Icon = tool.categoryIcon || Wrench;
              return (
                <li
                  key={tool.id}
                  id={`cmd-${tool.id}`}
                  role="option"
                  aria-selected={i === selected}
                  onClick={() => pick(tool)}
                  onMouseEnter={() => setSelected(i)}
                  className={[
                    'flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors',
                    i === selected
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700',
                  ].join(' ')}
                >
                  <div
                    className={[
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      i === selected
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-gray-100 text-gray-500',
                    ].join(' ')}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{tool.name}</p>
                    <p className={`truncate text-xs ${i === selected ? 'text-blue-500' : 'text-gray-500'}`}>{tool.categoryLabel}</p>
                  </div>
                  {i === selected && (
                    <ArrowRight size={14} className="shrink-0 text-blue-400" />
                  )}
                </li>
              );
            })
          )}
        </ul>

        <div className="flex items-center gap-4 border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">
          <span><kbd className="rounded border border-gray-200 bg-gray-50 px-1 font-mono text-[10px]">↑↓</kbd> navigate</span>
          <span><kbd className="rounded border border-gray-200 bg-gray-50 px-1 font-mono text-[10px]">↵</kbd> open</span>
          <span><kbd className="rounded border border-gray-200 bg-gray-50 px-1 font-mono text-[10px]">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
