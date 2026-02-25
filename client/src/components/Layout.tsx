import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Clock, CalendarClock, Users, Settings,
  LogOut, Building2, DollarSign, BarChart2,
} from "lucide-react";
import { ForcePasswordChange } from "./ForcePasswordChange";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  if (!user) return null;

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["employee", "manager", "admin"] },
    { href: "/timesheets", label: "Timesheets", icon: Clock, roles: ["employee", "manager", "admin"] },
    { href: "/requests", label: "Requests", icon: CalendarClock, roles: ["employee", "manager", "admin"] },
    { href: "/payroll", label: "Payroll", icon: DollarSign, roles: ["manager", "admin"] },
    { href: "/reports", label: "Reports", icon: BarChart2, roles: ["manager", "admin"] },
    { href: "/employees", label: "Employees", icon: Users, roles: ["admin"] },
    { href: "/settings", label: "Settings", icon: Settings, roles: ["employee", "manager", "admin"] },
  ];

  const allowedNav = navItems.filter((item) => item.roles.includes(user.role));
  const currentPage = allowedNav.find((n) => n.href === location)?.label ?? "Dashboard";

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans">
      <ForcePasswordChange />

      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-sidebar text-sidebar-foreground border-r border-sidebar-border shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-3 border-b border-sidebar-border/50">
          <div className="bg-primary p-1.5 rounded-md">
            <Building2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-none">FMS</h1>
            <p className="text-[10px] text-sidebar-foreground/50 uppercase tracking-widest font-medium mt-0.5">Timetrack</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {allowedNav.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User Footer */}
        <div className="p-3 border-t border-sidebar-border/50 space-y-2">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-sidebar-accent/40">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
              {user.av || user.name.charAt(0)}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold truncate leading-tight">{user.name}</p>
              <p className="text-[11px] text-sidebar-foreground/50 capitalize truncate">{user.pos}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-sm text-sidebar-foreground/60 h-9"
            onClick={() => logout()}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-6 bg-card border-b border-border shrink-0 sticky top-0 z-10">
          <h2 className="font-semibold text-foreground">{currentPage}</h2>
          <div className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 md:p-7 bg-background">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
