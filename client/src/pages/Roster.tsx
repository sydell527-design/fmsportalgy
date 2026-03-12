import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useUsers } from "@/hooks/use-users";
import { useQueryClient } from "@tanstack/react-query";
import { RosterBuilder } from "@/components/RosterBuilder";

export default function Roster() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data: users = [] } = useUsers();

  const activeEmployees = users
    .filter((u) => u.status === "active")
    .map((u) => ({ userId: u.userId, name: u.name, pos: u.pos ?? "" }));

  // Only admins and managers can access this page
  useEffect(() => {
    if (user && user.role === "employee") {
      navigate("/schedule");
    }
  }, [user]);

  function handleClose() {
    navigate("/schedule");
  }

  function handleSaved() {
    qc.invalidateQueries({ queryKey: ["/api/schedules"] });
    qc.invalidateQueries({ queryKey: ["/api/schedules/team"] });
  }

  return (
    <RosterBuilder
      open={true}
      onClose={handleClose}
      employees={activeEmployees}
      onSaved={handleSaved}
    />
  );
}
