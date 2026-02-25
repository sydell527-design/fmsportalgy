import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, UserCircle, KeyRound, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";

export default function Login() {
  const { user, login, isLoggingIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { toast } = useToast();

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
        </div>
        
        <p className="text-center text-sm text-muted-foreground mt-8 font-medium">
          Secure Internal Access Only
        </p>
      </div>
    </div>
  );
}
