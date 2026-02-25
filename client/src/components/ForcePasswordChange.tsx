import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateUser } from "@/hooks/use-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ForcePasswordChange() {
  const { user, refreshUser } = useAuth();
  const { mutateAsync: updateUser, isPending } = useUpdateUser();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  if (!user || !user.fpc) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "temp") {
      toast({ title: "Cannot reuse the default password", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    try {
      const updated = await updateUser({ id: user.id, password, fpc: false });
      refreshUser(updated);
      toast({ title: "Password updated — welcome to FMS Timetrack!" });
    } catch {
      toast({ title: "Failed to update password", variant: "destructive" });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-card rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-primary px-6 py-8 flex flex-col items-center text-primary-foreground">
          <div className="h-14 w-14 bg-primary-foreground/20 rounded-full flex items-center justify-center mb-4">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-center">Password Change Required</h2>
          <p className="text-primary-foreground/75 text-sm text-center mt-2">
            For security, you must set a personal password before accessing the system.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fpc-new">New Password</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="fpc-new"
                type="password"
                className="pl-9"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="input-fpc-new"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fpc-confirm">Confirm Password</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="fpc-confirm"
                type="password"
                className="pl-9"
                placeholder="Repeat new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                data-testid="input-fpc-confirm"
              />
            </div>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={isPending || !password || !confirm}
            data-testid="button-fpc-submit"
          >
            {isPending ? "Securing Account..." : "Set My Password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
