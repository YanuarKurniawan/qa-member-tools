import { Download } from 'lucide-react';

export default function ResultsTable({ results = [], title = 'Results' }) {
  if (!results || results.length === 0) return null;

  const columns = Object.keys(results[0]);

  const downloadCsv = () => {
    const header = columns.join(',');
    const rows = results.map((row) =>
      columns
        .map((col) => {
          const val = String(row[col] ?? '');
          return val.includes(',') || val.includes('"')
            ? `"${val.replace(/"/g, '""')}"`
            : val;
        })
        .join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `results-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h4 className="text-sm font-semibold text-gray-700">
          {title}{' '}
          <span className="font-normal text-gray-500">({results.length} rows)</span>
        </h4>
        <button
          type="button"
          onClick={downloadCsv}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              {columns.map((col) => (
                <th key={col} className="whitespace-nowrap px-4 py-2.5 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {results.slice(0, 100).map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {columns.map((col) => (
                  <td
                    key={col}
                    className="max-w-xs truncate whitespace-nowrap px-4 py-2 text-gray-700"
                    title={String(row[col] ?? '')}
                  >
                    {String(row[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {results.length > 100 && (
          <div className="border-t border-gray-100 px-4 py-2 text-center text-xs text-gray-500">
            Showing first 100 of {results.length} rows. Export CSV for full data.
          </div>
        )}
      </div>
    </div>
  );
}
