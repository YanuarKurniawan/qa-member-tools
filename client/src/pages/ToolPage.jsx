import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import ToolForm from '../components/ToolForm';

export default function ToolPage({ category }) {
  const [expanded, setExpanded] = useState(null);
  const Icon = category.icon || Wrench;

  const toggle = (toolId) => {
    setExpanded((prev) => (prev === toolId ? null : toolId));
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Icon size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{category.label}</h1>
          <p className="text-sm text-gray-500">{category.description}</p>
        </div>
      </div>

      <div className="space-y-3">
        {category.tools.map((tool) => {
          const isOpen = expanded === tool.id;

          return (
            <div
              key={tool.id}
              className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-all ${
                isOpen ? 'border-blue-200 shadow-md' : 'border-gray-200'
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(tool.id)}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    isOpen
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  <Wrench size={18} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{tool.name}</h3>
                  <p className="text-sm text-gray-500">{tool.description}</p>
                </div>
                <div className="shrink-0 text-gray-400">
                  {isOpen ? (
                    <ChevronDown size={20} />
                  ) : (
                    <ChevronRight size={20} />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-5 py-5">
                  <ToolForm tool={tool} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
