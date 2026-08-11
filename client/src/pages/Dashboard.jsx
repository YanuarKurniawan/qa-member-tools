import { Link } from 'react-router-dom';
import { ArrowRight, Wrench } from 'lucide-react';

export default function Dashboard({ categories = [] }) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          QA automation tools for member services, user management, and testing.
          Press <kbd className="rounded border border-gray-200 bg-gray-100 px-1 py-0.5 text-[11px] font-medium text-gray-500">⌘K</kbd> to search.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => {
          const Icon = cat.icon || Wrench;
          return (
            <Link
              key={cat.id}
              to={`/${cat.id}`}
              className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-blue-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
                  <Icon size={22} />
                </div>
                <ArrowRight
                  size={18}
                  className="text-gray-300 transition-colors group-hover:text-blue-500"
                />
              </div>
              <h3 className="font-semibold text-gray-900">{cat.label}</h3>
              <p className="mt-1 text-sm text-gray-500">{cat.description}</p>
              <p className="mt-3 text-xs font-medium text-blue-600">
                {cat.tools.length} tool{cat.tools.length !== 1 ? 's' : ''}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
