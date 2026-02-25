import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateUser } from "@/hooks/use-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ForcePasswordChange() {
  const { user } = useAuth();
  const { mutateAsync: updateUser, isPending } = useUpdateUser();
  const { toast } = useToast();
  
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  if (!user || !user.fpc) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }

    try {
      await updateUser({ id: user.id, password, fpc: false });
      toast({ title: "Password updated successfully!" });
    } catch (err) {
      toast({ title: "Failed to update password", variant: "destructive" });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="bg-primary/10 p-6 flex flex-col items-center border-b border-primary/20">
          <div className="h-16 w-16 bg-primary/20 rounded-full flex items-center justify-center mb-4">
            <ShieldAlert className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground text-center">Action Required</h2>
          <p className="text-muted-foreground text-center mt-2">
            For security reasons, you must change your default password before accessing the system.
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input 
                  id="new-password"
                  type="password" 
                  className="pl-10"
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input 
                  id="confirm-password"
                  type="password" 
                  className="pl-10"
                  placeholder="Confirm new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 text-lg font-medium shadow-lg hover:shadow-xl transition-all"
            disabled={isPending || !password || !confirm}
          >
            {isPending ? "Updating Security..." : "Secure My Account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
