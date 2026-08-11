import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ToolPage from './pages/ToolPage';
import AutomationWeb from './pages/AutomationWeb';
import TestRunner from './pages/TestRunner';
import CommandPalette from './components/CommandPalette';
import { CATEGORY_META } from './categoryMeta';

export default function App() {
  const [toolCategories, setToolCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/tools')
      .then((res) => res.json())
      .then((tools) => {
        const grouped = {};
        for (const tool of tools) {
          if (!grouped[tool.category]) {
            const meta = CATEGORY_META[tool.category] || {};
            grouped[tool.category] = {
              id: tool.category,
              label: meta.label || tool.category,
              icon: meta.icon || 'Wrench',
              description: meta.description || '',
              tools: [],
            };
          }
          grouped[tool.category].tools.push(tool);
        }
        setToolCategories(Object.values(grouped));
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load tools:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="mt-3 text-sm text-gray-500">Loading tools...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <CommandPalette categories={toolCategories} />
      <Routes>
        <Route element={<Layout categories={toolCategories} />}>
          <Route path="/" element={<Dashboard categories={toolCategories} />} />
          <Route path="/automation-web" element={<AutomationWeb />} />
          <Route path="/test-runner" element={<TestRunner />} />
          <Route path="/test-runner/:runId" element={<TestRunner />} />
          {toolCategories.map((cat) => (
            <Route
              key={cat.id}
              path={`/${cat.id}`}
              element={<ToolPage category={cat} />}
            />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
