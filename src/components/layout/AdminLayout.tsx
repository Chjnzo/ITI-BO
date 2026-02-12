import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, MessageSquare, LogOut, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const navItems = [
    { icon: Home, label: 'Immobili', path: '/' },
    { icon: MessageSquare, label: 'Messaggi', path: '/leads' },
  ];

  return (
    <div className="flex min-h-screen bg-[#f8f9fa] text-[#1a1a1a]">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-8">
          <h1 className="text-xl font-bold tracking-tight text-[#94b0ab]">Admin OS</h1>
          <p className="text-xs text-gray-400 uppercase tracking-widest mt-1">Il Tuo Immobiliare</p>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
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

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full text-left text-gray-500 hover:text-red-500 transition-colors rounded-xl hover:bg-red-50"
          >
            <LogOut size={20} />
            <span className="font-medium">Esci</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;