import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Users, LogOut, Calendar, LayoutDashboard, Menu, X, ListTodo, Calculator, PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

interface AdminLayoutProps {
  children: React.ReactNode;
  fullHeight?: boolean;
  wide?: boolean;
}

const SIDEBAR_COLLAPSED_W = 64;  // px — icon-only width
const SIDEBAR_EXPANDED_W  = 224; // px — full label width

const AdminLayout = ({ children, fullHeight = false, wide = false }: AdminLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebar-pinned') === 'true'; } catch { return false; }
  });

  const togglePinned = () => {
    setIsPinned(v => {
      const next = !v;
      try { localStorage.setItem('sidebar-pinned', String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const isExpanded = isPinned || isHovered;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Home, label: 'Immobili', path: '/immobili' },
    { icon: Calculator, label: 'Valutazioni', path: '/valutazioni' },
    { icon: Calendar, label: 'Agenda', path: '/agenda' },
    { icon: Users, label: 'Lead', path: '/leads' },
    { icon: ListTodo, label: 'Task', path: '/tasks' },
  ];

  const SidebarContent = ({ expanded = false, pinned = false, onTogglePin }: { expanded?: boolean; pinned?: boolean; onTogglePin?: () => void }) => (
    <>
      {/* Logo */}
      <div className={cn(
        "flex items-center border-b border-gray-100 select-none overflow-hidden",
        expanded ? "p-6" : "justify-center py-6 px-2"
      )}>
        <span className="text-xl font-bold text-[#94b0ab] shrink-0">ITI</span>
        <div className={cn(
          "ml-2 transition-all duration-250 overflow-hidden whitespace-nowrap",
          expanded ? "opacity-100 max-w-[140px]" : "opacity-0 max-w-0"
        )}>
          <span className="text-xl font-bold tracking-tight text-[#94b0ab]"> Gestionale</span>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest">Il Tuo Immobiliare</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 overflow-y-auto px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setIsSidebarOpen(false)}
              className={cn(
                "flex items-center py-3 px-3 rounded-xl transition-all duration-200 group overflow-hidden",
                isActive
                  ? "bg-[#94b0ab]/10 text-[#94b0ab]"
                  : "text-gray-500 hover:bg-gray-50 hover:text-[#1a1a1a]"
              )}
            >
              <item.icon size={20} className={cn(
                "shrink-0 transition-colors",
                isActive ? "text-[#94b0ab]" : "text-gray-400 group-hover:text-[#1a1a1a]"
              )} />
              <span className={cn(
                "ml-3 font-medium whitespace-nowrap transition-all duration-250 overflow-hidden",
                expanded ? "opacity-100 max-w-[140px]" : "opacity-0 max-w-0 ml-0"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-100 bg-white p-2 space-y-1">
        <button
          onClick={handleLogout}
          className="flex items-center py-3 px-3 w-full text-gray-500 hover:text-red-500 transition-colors rounded-xl hover:bg-red-50 overflow-hidden"
        >
          <LogOut size={20} className="shrink-0" />
          <span className={cn(
            "ml-3 font-medium whitespace-nowrap transition-all duration-250 overflow-hidden",
            expanded ? "opacity-100 max-w-[140px]" : "opacity-0 max-w-0 ml-0"
          )}>
            Esci
          </span>
        </button>
        {onTogglePin && (
          <button
            onClick={onTogglePin}
            title={pinned ? 'Disattiva sidebar fissa' : 'Fissa sidebar aperta'}
            className={cn(
              "flex items-center py-3 px-3 w-full rounded-xl transition-colors overflow-hidden",
              pinned
                ? "text-[#94b0ab] bg-[#94b0ab]/10 hover:bg-[#94b0ab]/20"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            )}
          >
            <PanelLeft size={20} className="shrink-0" />
            <span className={cn(
              "ml-3 font-medium whitespace-nowrap transition-all duration-250 overflow-hidden",
              expanded ? "opacity-100 max-w-[140px]" : "opacity-0 max-w-0 ml-0"
            )}>
              {pinned ? 'Fissa attiva' : 'Fissa sidebar'}
            </span>
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-[#f8f9fa] text-[#1a1a1a] overflow-hidden">

      {/* Desktop Sidebar — fixed, overlays content on hover */}
      <aside
        className="hidden md:flex bg-white border-r border-gray-200 flex-col h-full fixed left-0 top-0 z-30 transition-all duration-300 ease-in-out overflow-hidden"
        style={{ width: isExpanded ? SIDEBAR_EXPANDED_W : SIDEBAR_COLLAPSED_W }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <SidebarContent expanded={isExpanded} pinned={isPinned} onTogglePin={togglePinned} />
      </aside>

      {/* Spacer — grows with sidebar when pinned, stays narrow otherwise */}
      <div
        className="hidden md:block shrink-0 transition-all duration-300 ease-in-out"
        style={{ width: isPinned ? SIDEBAR_EXPANDED_W : SIDEBAR_COLLAPSED_W }}
      />

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-56 bg-white border-r border-gray-200 flex flex-col h-full transition-transform duration-300 md:hidden",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <button
          onClick={() => setIsSidebarOpen(false)}
          className="absolute top-4 right-4 p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
          aria-label="Chiudi menu"
        >
          <X size={20} />
        </button>
        <SidebarContent expanded={true} />
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
          <span className="text-base font-bold text-[#94b0ab]">ITI Gestionale</span>
        </div>

        {fullHeight ? (
          <div className={cn('flex-1 overflow-hidden flex flex-col min-h-0', wide ? 'p-3 md:p-4' : 'p-4 md:p-8')}>
            <div className={cn('flex-1 overflow-hidden flex flex-col min-h-0 w-full', !wide && 'max-w-6xl mx-auto')}>
              {children}
            </div>
          </div>
        ) : (
          <div className={cn('flex-1', wide ? 'p-3 md:p-4' : 'p-4 md:p-8')}>
            <div className={cn('pb-12', !wide && 'max-w-6xl mx-auto')}>
              {children}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminLayout;
