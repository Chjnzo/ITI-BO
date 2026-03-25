import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, MessageSquare, LogOut, CalendarDays, Calendar, LayoutDashboard, Menu, X, ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

interface AdminLayoutProps {
  children: React.ReactNode;
  fullHeight?: boolean;
}

const AdminLayout = ({ children, fullHeight = false }: AdminLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Home, label: 'Immobili', path: '/immobili' },
    { icon: Calendar, label: 'Agenda', path: '/agenda' },
    { icon: MessageSquare, label: 'Lead', path: '/leads' },
    { icon: ListTodo, label: 'Task', path: '/tasks' },
    { icon: CalendarDays, label: 'Open House', path: '/open-houses' },
  ];

  const SidebarContent = () => (
    <>
      <div className="p-8">
        <h1 className="text-xl font-bold tracking-tight text-[#94b0ab]">Admin OS</h1>
        <p className="text-xs text-gray-400 uppercase tracking-widest mt-1">Il Tuo Immobiliare</p>
      </div>

      <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            onClick={() => setIsSidebarOpen(false)}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
              location.pathname === item.path
                ? "bg-[#94b0ab]/10 text-[#94b0ab]"
                : "text-gray-500 hover:bg-gray-50 hover:text-[#1a1a1a]"
            )}
          >
            <item.icon size={20} className={cn(
              "transition-colors",
              location.pathname === item.path ? "text-[#94b0ab]" : "text-gray-400 group-hover:text-[#1a1a1a]"
            )} />
            <span className="font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-100 bg-white">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 w-full text-left text-gray-500 hover:text-red-500 transition-colors rounded-xl hover:bg-red-50"
        >
          <LogOut size={20} />
          <span className="font-medium">Esci</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-[#f8f9fa] text-[#1a1a1a] overflow-hidden">

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col h-full shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col h-full transition-transform duration-300 md:hidden",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <button
          onClick={() => setIsSidebarOpen(false)}
          className="absolute top-4 right-4 p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
          aria-label="Chiudi menu"
        >
          <X size={20} />
        </button>
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className={cn('flex-1 flex flex-col min-w-0', fullHeight ? 'overflow-hidden' : 'overflow-y-auto scroll-smooth')}>
        {/* Mobile top bar with hamburger */}
        <div className="md:hidden flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100 shrink-0">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Apri menu"
          >
            <Menu size={22} />
          </button>
          <span className="text-base font-bold text-[#94b0ab]">Admin OS</span>
        </div>

        {fullHeight ? (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0 p-4 md:p-8">
            <div className="flex-1 overflow-hidden flex flex-col min-h-0 max-w-6xl mx-auto w-full">
              {children}
            </div>
          </div>
        ) : (
          <div className="flex-1 p-4 md:p-8">
            <div className="max-w-6xl mx-auto pb-12">
              {children}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminLayout;
