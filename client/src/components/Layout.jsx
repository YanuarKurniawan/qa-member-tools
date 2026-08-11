import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout({ categories }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar categories={categories} />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="mx-auto max-w-6xl px-5 pb-8 pt-16 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
