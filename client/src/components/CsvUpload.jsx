import { useState, useRef } from 'react';
import { Upload, FileText, X, Download } from 'lucide-react';

export default function CsvUpload({ csvInfo, csvExample, onFileSelect, file }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.name.endsWith('.csv')) {
      onFileSelect(dropped);
    }
  };

  const handleSelect = (e) => {
    const selected = e.target.files[0];
    if (selected) onFileSelect(selected);
  };

  const downloadExample = () => {
    if (!csvExample) return;
    const blob = new Blob([csvExample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'example.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">CSV File</label>
        {csvExample && (
          <button
            type="button"
            onClick={downloadExample}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            <Download size={12} />
            Download template
          </button>
        )}
      </div>

      {csvInfo && <p className="text-xs text-gray-500">{csvInfo}</p>}

      {file ? (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <FileText size={20} className="text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-900">{file.name}</p>
              <p className="text-xs text-green-600">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onFileSelect(null)}
            className="rounded p-1 text-green-600 hover:bg-green-100"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 transition-colors ${
            dragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
          }`}
        >
          <Upload size={24} className="text-gray-400" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">
              Drop your CSV file here or{' '}
              <span className="text-blue-600">browse</span>
            </p>
            <p className="mt-1 text-xs text-gray-500">Only .csv files accepted</p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        onChange={handleSelect}
        className="hidden"
      />
    </div>
  );
}
