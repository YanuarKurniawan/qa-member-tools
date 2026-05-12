import { Link } from 'react-router-dom';
import { ArrowRight, Wrench } from 'lucide-react';

export default function Dashboard({ categories = [] }) {
  const totalTools = categories.reduce(
    (sum, cat) => sum + cat.tools.length,
    0
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          QA automation tools for member services, user management, and testing
        </p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total Tools</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{totalTools}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Categories</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">
            {categories.length}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Environment</p>
          <p className="mt-1 text-lg font-bold text-amber-600">
            Preprod / Test / Sandbox
          </p>
        </div>
      </div>

      <h2 className="mb-4 text-lg font-semibold text-gray-800">Tool Categories</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => {
          const Icon = cat.icon || Wrench;
          return (
            <Link
              key={cat.id}
              to={`/${cat.id}`}
              className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-blue-200 hover:shadow-md"
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
