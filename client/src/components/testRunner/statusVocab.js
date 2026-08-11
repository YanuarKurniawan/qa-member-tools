export const STATUS_STYLES = {
  1: { label: 'Passed', pill: 'border-green-200 bg-green-50 text-green-800', dot: 'bg-green-500' },
  2: { label: 'Blocked', pill: 'border-amber-200 bg-amber-50 text-amber-900', dot: 'bg-amber-500' },
  3: { label: 'Untested', pill: 'border-gray-200 bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  4: { label: 'Retest', pill: 'border-blue-200 bg-blue-50 text-blue-800', dot: 'bg-blue-500' },
  5: { label: 'Failed', pill: 'border-red-200 bg-red-50 text-red-800', dot: 'bg-red-500' },
  6: { label: 'Obsolete', pill: 'border-gray-300 bg-gray-100 text-gray-500', dot: 'bg-gray-400' },
};

const FALLBACK_STYLE = { label: 'Unknown', pill: 'border-gray-200 bg-gray-100 text-gray-600', dot: 'bg-gray-400' };

export const QUICK_STATUS_IDS = [1, 5, 2, 4];

export const SHORTCUT_TO_STATUS = { p: 1, f: 5, b: 2, r: 4 };

export function statusStyle(id) {
  return STATUS_STYLES[id] || FALLBACK_STYLE;
}

export function statusLabel(vocab, id) {
  const found = (vocab?.statuses || []).find((status) => status.id === id);
  return found ? found.label : statusStyle(id).label;
}

export function priorityLabel(vocab, id) {
  const found = (vocab?.priorities || []).find((priority) => priority.id === id);
  return found ? found.label : String(id);
}
