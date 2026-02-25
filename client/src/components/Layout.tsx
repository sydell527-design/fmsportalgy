import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Clock, 
  CalendarClock, 
  Users, 
  Settings, 
  LogOut,
  Building2,
  Menu,
  Bell
} from "lucide-react";
import { ForcePasswordChange } from "./ForcePasswordChange";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  if (!user) return null; // Or a loading spinner if preferred

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["employee", "manager", "admin"] },
    { href: "/timesheets", label: "Timesheets", icon: Clock, roles: ["employee", "manager", "admin"] },
    { href: "/requests", label: "Requests", icon: CalendarClock, roles: ["employee", "manager", "admin"] },
    { href: "/employees", label: "Employees", icon: Users, roles: ["admin"] },
    { href: "/settings", label: "Settings", icon: Settings, roles: ["employee", "manager", "admin"] },
  ];

  const allowedNav = navItems.filter(item => item.roles.includes(user.role));

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans">
      <ForcePasswordChange />
      
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-xl z-10">
        <div className="p-6 flex items-center gap-3 border-b border-sidebar-border/50">
          <div className="bg-primary p-2 rounded-lg">
            <Building2 className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl tracking-tight leading-none">FMS</h1>
            <p className="text-xs text-sidebar-foreground/60 uppercase tracking-wider font-semibold mt-1">Timetrack</p>
          </div>
        </div>
        
        <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          {allowedNav.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className={`
                flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                ${isActive 
                  ? 'bg-primary text-primary-foreground font-medium shadow-md shadow-primary/20' 
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground hover:translate-x-1'}
              `}>
                <item.icon className={`w-5 h-5 ${isActive ? 'text-primary-foreground' : ''}`} />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-sidebar-border/50">
          <div className="bg-sidebar-accent/50 p-4 rounded-xl mb-4 flex items-center gap-3 border border-sidebar-border">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {user.av || user.name.charAt(0)}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold truncate">{user.name}</p>
              <p className="text-xs text-sidebar-foreground/50 capitalize truncate">{user.role}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10"
            onClick={() => logout()}
          >
            <LogOut className="w-5 h-5 mr-3" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen max-w-[100vw] overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-white border-b border-border shadow-sm z-20">
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            <h1 className="font-display font-bold text-lg">FMS</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon">
              <Menu className="w-6 h-6" />
            </Button>
          </div>
        </header>

        {/* Desktop Header area / Top Bar */}
        <header className="hidden md:flex h-20 items-center justify-between px-8 bg-white/50 backdrop-blur-sm border-b border-border/50 sticky top-0 z-10">
          <h2 className="font-display font-semibold text-2xl text-foreground">
            {allowedNav.find(n => n.href === location)?.label || 'Dashboard'}
          </h2>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" className="rounded-full bg-white">
              <Bell className="w-5 h-5 text-muted-foreground" />
            </Button>
            <div className="text-right">
              <p className="text-sm font-medium leading-none">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-background">
          <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
