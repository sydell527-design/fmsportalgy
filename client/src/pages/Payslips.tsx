import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FileText, ChevronRight, FileDown } from "lucide-react";
import { format } from "date-fns";
import { formatGYD } from "@/lib/payroll";
import { downloadPayslipPDF, computeYTD } from "@/lib/payslip-pdf";
import type { YTDFigures } from "@/lib/payslip-pdf";
import type { PayrollResult } from "@/lib/payroll";
import type { Payslip } from "@shared/schema";
import { PayslipLandscape } from "@/components/PayslipLandscape";

export default function Payslips() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Payslip | null>(null);

  const { data: payslips = [], isLoading } = useQuery<Payslip[]>({
    queryKey: ["/api/payslips", user.userId],
    queryFn: () => fetch(`/api/payslips?eid=${user.userId}`).then((r) => r.json()),
  });

  const { mutate: markSeen } = useMutation({
    mutationFn: (id: number) => apiRequest("PUT", `/api/payslips/${id}/seen`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/payslips", user.userId] }),
  });

  function open(p: Payslip) {
    setSelected(p);
    if (!p.seen) markSeen(p.id);
  }

  function buildYTD(p: Payslip): YTDFigures | undefined {
    if (!p.periodEnd) return undefined;
    const allData = payslips.map((ps) => ps.data as unknown as PayrollResult);
    return computeYTD(allData, p.periodEnd);
  }

  const unread = payslips.filter((p) => !p.seen).length;

  function safeNetPay(data: unknown): string {
    try {
      const r = data as PayrollResult;
      if (typeof r?.netPay === "number") return formatGYD(r.netPay);
    } catch {}
    return "N/A";
  }

  const selectedYTD = selected ? buildYTD(selected) : undefined;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Payslips
            {unread > 0 && (
              <Badge className="bg-red-500 text-white text-xs" data-testid="badge-unread-payslips">
                {unread} new
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Payslips issued to you by FMS Administration
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : payslips.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="font-semibold text-muted-foreground">No payslips yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Payslips will appear here once issued by your administrator.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {payslips.map((p) => (
            <Card
              key={p.id}
              className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors ${!p.seen ? "border-primary/40 bg-primary/5" : ""}`}
              onClick={() => open(p)}
              data-testid={`payslip-card-${p.id}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${!p.seen ? "bg-primary" : "bg-transparent"}`} />
                <div className="min-w-0">
                  <p className="font-semibold text-sm leading-tight">{p.period}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Issued {format(new Date(p.sentAt), "d MMM yyyy, h:mm a")} · Net Pay:{" "}
                    <span className="font-semibold text-green-600">{safeNetPay(p.data)}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!p.seen && <Badge variant="default" className="text-xs">New</Badge>}
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto" aria-describedby="payslip-desc">
          <DialogTitle className="sr-only">Payslip — {selected?.period}</DialogTitle>
          <p id="payslip-desc" className="sr-only">Payslip detail view</p>
          {selected && (
            <>
              <div className="text-base font-bold mb-2 text-foreground">
                Payslip — {selected.period}
              </div>
              <PayslipLandscape
                r={selected.data as unknown as PayrollResult}
                tin={(user as any).tin}
                nisNumber={(user as any).nisNumber}
                ytd={selectedYTD}
              />
              <div className="flex gap-2 justify-end pt-3 flex-wrap">
                {(selected.data as unknown as PayrollResult)?.employee && (
                  <Button variant="outline" size="sm"
                    onClick={() => {
                      const r = selected.data as unknown as PayrollResult;
                      downloadPayslipPDF({
                        ...r,
                        employee: {
                          ...r.employee,
                          tin: (user as any).tin ?? (r.employee as any).tin,
                          nisNumber: (user as any).nisNumber ?? (r.employee as any).nisNumber,
                          bankName: (user as any).bankName ?? (r.employee as any).bankName,
                          bankBranch: (user as any).bankBranch ?? (r.employee as any).bankBranch,
                          bankAccountNumber: (user as any).bankAccountNumber ?? (r.employee as any).bankAccountNumber,
                        } as any,
                      }, selectedYTD);
                    }}
                    data-testid="button-download-pdf"
                  >
                    <FileDown className="w-4 h-4 mr-1.5" /> Download PDF
                  </Button>
                )}
                <Button size="sm" onClick={() => setSelected(null)}>Close</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
