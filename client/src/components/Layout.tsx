import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Clock, CalendarClock, Users, Settings,
  LogOut, Building2, DollarSign, BarChart2, ScrollText, Menu, X, UserCircle,
} from "lucide-react";
import { ForcePasswordChange } from "./ForcePasswordChange";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!user) return null;

  const navItems = [
    { href: "/",                                  label: "Dashboard",  icon: LayoutDashboard, roles: ["employee", "manager", "admin"] },
    { href: "/timesheets",                        label: "Timesheets", icon: Clock,            roles: ["employee", "manager", "admin"] },
    { href: "/requests",                          label: "Requests",   icon: CalendarClock,    roles: ["employee", "manager", "admin"] },
    { href: `/employee/${user.userId}`,           label: "My Profile", icon: UserCircle,       roles: ["employee"] },
    { href: "/payroll",                           label: "Payroll",    icon: DollarSign,       roles: ["manager", "admin"] },
    { href: "/reports",                           label: "Reports",    icon: BarChart2,        roles: ["manager", "admin"] },
    { href: "/employees",                         label: "Employees",  icon: Users,            roles: ["admin", "manager"] },
    { href: "/settings",                          label: "Settings",   icon: Settings,         roles: ["employee", "manager", "admin"] },
    { href: "/changelog",                         label: "Changelog",  icon: ScrollText,       roles: ["admin", "manager"] },
  ];

  const allowedNav = navItems.filter((item) => item.roles.includes(user.role));
  const currentPage = allowedNav.find((n) => n.href === location)?.label ?? "FMS Timetrack";

  // Bottom nav shows the most relevant 4–5 items on mobile
  const bottomNavItems = allowedNav.slice(0, 5);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans">
      <ForcePasswordChange />

      {/* ── Desktop Sidebar ──────────────────────────────────────────────── */}
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

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">

        {/* Mobile Top Bar */}
        <header className="h-14 flex items-center justify-between px-4 md:px-6 bg-card border-b border-border shrink-0 sticky top-0 z-20">
          {/* Mobile: logo + page title */}
          <div className="flex items-center gap-2.5 md:gap-0">
            <div className="flex items-center gap-2 md:hidden">
              <div className="bg-primary p-1 rounded">
                <Building2 className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-sm leading-none">FMS</span>
              <span className="text-muted-foreground text-sm">·</span>
            </div>
            <h2 className="font-semibold text-foreground text-sm md:text-base">{currentPage}</h2>
          </div>

          {/* Desktop: date */}
          <div className="hidden md:block text-xs text-muted-foreground">
            {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          </div>

          {/* Mobile: hamburger for extra nav (overflow) */}
          <button
            className="md:hidden p-2 rounded-md hover:bg-muted transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="button-mobile-menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </header>

        {/* Mobile slide-down overflow menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-card border-b border-border shadow-lg z-10 px-4 py-3 space-y-1">
            {allowedNav.map((item) => {
              const isActive = location === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
            <div className="pt-2 border-t border-border mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                  {user.av || user.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.pos}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => { logout(); setMobileMenuOpen(false); }} className="text-xs h-8">
                <LogOut className="w-3.5 h-3.5 mr-1" /> Sign Out
              </Button>
            </div>
          </div>
        )}

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-background pb-20 md:pb-6">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>

        {/* ── Mobile Bottom Navigation Bar ─────────────────────────────── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-card border-t border-border flex">
          {bottomNavItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`bottom-nav-${item.label.toLowerCase()}`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                <span className="leading-tight">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
