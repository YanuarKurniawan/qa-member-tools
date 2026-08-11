import { useState, useEffect, useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { QUICK_STATUS_IDS, statusStyle, statusLabel } from './statusVocab';

export default function StatusCell({ test, vocab, disabled, onPatch }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const quick = (vocab?.statuses || []).filter((status) => QUICK_STATUS_IDS.includes(status.id));
  const rest = (vocab?.statuses || []).filter((status) => !QUICK_STATUS_IDS.includes(status.id));
  const isDraft = test.dirtyFields.includes('statusId');

  const set = (statusId) => {
    setOpen(false);
    if (statusId !== test.statusId) onPatch(test.testId, { statusId });
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
      {quick.map((status) => {
        const active = test.statusId === status.id;
        const style = statusStyle(status.id);
        return (
          <button
            key={status.id}
            type="button"
            disabled={disabled}
            onClick={() => set(status.id)}
            title={status.label}
            aria-pressed={active}
            className={`rounded-md border px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 ${
              active ? style.pill : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {status.label.charAt(0)}
          </button>
        );
      })}

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
          aria-label="More statuses"
          aria-expanded={open}
          className="rounded-md border border-gray-200 bg-white p-1 text-gray-400 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <MoreHorizontal size={14} />
        </button>
        {open && (
          <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {rest.map((status) => (
              <button
                key={status.id}
                type="button"
                onClick={() => set(status.id)}
                className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {status.label}
              </button>
            ))}
            {isDraft && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPatch(test.testId, { statusId: null });
                }}
                className="block w-full border-t border-gray-100 px-3 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Clear draft status
              </button>
            )}
          </div>
        )}
      </div>

      {isDraft && (
        <span
          className="ml-1 h-1.5 w-1.5 rounded-full bg-blue-500"
          title={`Unsaved: ${statusLabel(vocab, test.statusId)}`}
        />
      )}
    </div>
  );
}
