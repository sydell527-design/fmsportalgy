import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, UserCircle, KeyRound, Loader2, HelpCircle, CheckCircle2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";

export default function Login() {
  const { user, login, isLoggingIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { toast } = useToast();

  const [forgotOpen, setForgotOpen]     = useState(false);
  const [forgotId, setForgotId]         = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent]     = useState(false);

  if (user) {
    return <Redirect to="/" />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ username, password });
      toast({ title: "Welcome back!" });
    } catch (err: any) {
      toast({ 
        title: "Login failed", 
        description: err.message,
        variant: "destructive" 
      });
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotId.trim()) return;
    setForgotLoading(true);
    try {
      const res = await fetch("/api/password-reset-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: forgotId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Request failed", description: data.message, variant: "destructive" });
      } else {
        setForgotSent(true);
      }
    } catch {
      toast({ title: "Network error", description: "Please try again.", variant: "destructive" });
    } finally {
      setForgotLoading(false);
    }
  };

  const closeForgot = () => {
    setForgotOpen(false);
    setForgotId("");
    setForgotSent(false);
    setForgotLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Decorative Background */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/30 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="w-full max-w-md relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary shadow-xl shadow-primary/30 mb-6 transform -rotate-6 hover:rotate-0 transition-transform duration-300">
            <Building2 className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="font-display text-4xl font-bold text-foreground tracking-tight">FMS Timetrack</h1>
          <p className="text-muted-foreground mt-2 font-medium">Enterprise Management System</p>
        </div>

        <div className="bg-card rounded-3xl p-8 border border-border/50 corporate-shadow">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-semibold">Employee ID / Username</Label>
              <div className="relative">
                <UserCircle className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
                <Input 
                  id="username"
                  data-testid="input-username"
                  className="pl-11 h-12 bg-background/50 border-border focus:bg-background transition-colors rounded-xl"
                  placeholder="e.g. 1001"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoggingIn}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="password" className="text-sm font-semibold">Password</Label>
              </div>
              <div className="relative">
                <KeyRound className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
                <Input 
                  id="password"
                  data-testid="input-password"
                  type="password"
                  className="pl-11 h-12 bg-background/50 border-border focus:bg-background transition-colors rounded-xl"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoggingIn}
                  required
                />
              </div>
            </div>

            <Button 
              type="submit" 
              data-testid="button-signin"
              className="w-full h-12 text-base font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all duration-200"
              disabled={isLoggingIn || !username || !password}
            >
              {isLoggingIn ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Authenticating...</>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          {/* Forgot Password */}
          <div className="mt-5 text-center">
            <button
              type="button"
              data-testid="button-forgot-password"
              onClick={() => setForgotOpen(true)}
              className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5 font-medium"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Forgot password?
            </button>
          </div>
        </div>
        
        <p className="text-center text-sm text-muted-foreground mt-8 font-medium">
          Secure Internal Access Only
        </p>
      </div>

      {/* Forgot Password Dialog */}
      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeForgot} />
          <div className="relative w-full max-w-sm bg-card rounded-2xl border border-border shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={closeForgot}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
              data-testid="button-close-forgot"
            >
              <X className="w-4 h-4" />
            </button>

            {forgotSent ? (
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 mb-4">
                  <CheckCircle2 className="w-7 h-7 text-green-600" />
                </div>
                <h2 className="text-lg font-bold text-foreground mb-2">Request Sent</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Your password reset request has been sent to the administrator.
                  You will be notified once your credentials have been reset.
                </p>
                <button
                  onClick={closeForgot}
                  data-testid="button-forgot-done"
                  className="mt-5 w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Back to Login
                </button>
              </div>
            ) : (
              <>
                <div className="mb-5">
                  <h2 className="text-lg font-bold text-foreground">Forgot Password</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Enter your Employee ID and we'll send a reset request to your administrator.
                  </p>
                </div>
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-id" className="text-sm font-semibold">Employee ID</Label>
                    <div className="relative">
                      <UserCircle className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="forgot-id"
                        data-testid="input-forgot-employee-id"
                        className="pl-9 h-10 rounded-xl bg-background/50"
                        placeholder="e.g. 1001"
                        value={forgotId}
                        onChange={(e) => setForgotId(e.target.value)}
                        disabled={forgotLoading}
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    data-testid="button-submit-forgot"
                    disabled={forgotLoading || !forgotId.trim()}
                    className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {forgotLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : "Send Reset Request"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
