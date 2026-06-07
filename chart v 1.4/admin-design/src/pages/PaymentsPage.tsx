import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Chip } from "@heroui/react";
import { chartApi } from "@/api/chartClient";
import { PageShell, PanelCard } from "@/components/PageShell";
import { SimpleTable } from "@/components/SimpleTable";
import { useToast } from "@/hooks/useToast";

type Payment = {
  id: number;
  created_at?: string;
  user_name?: string;
  user_email?: string;
  amount?: number;
  currency?: string;
  status?: string;
  refunded?: boolean;
  provider?: string;
  description?: string;
  invoice_url?: string;
};

export function PaymentsPage() {
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await chartApi<{ payments?: Payment[] }>("/api/admin/payments");
      setPayments(data.payments ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Load failed", "danger");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const succeeded = payments.filter((p) => p.status === "succeeded" && !p.refunded);
    const totalRevenue = succeeded.reduce((s, p) => s + (p.amount || 0), 0);
    const refunded = payments.filter((p) => p.refunded);
    const totalRefunded = refunded.reduce((s, p) => s + (p.amount || 0), 0);
    return { totalRevenue, totalRefunded, succeeded: succeeded.length, failed: payments.filter((p) => p.status === "failed").length };
  }, [payments]);

  const refund = async (id: number) => {
    if (!confirm("Refund this payment?")) return;
    try {
      await chartApi(`/api/admin/payments/${id}/refund`, { method: "POST" });
      toast("Payment refunded", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Refund failed", "danger");
    }
  };

  return (
    <PageShell title="Payments" loading={loading} actions={<Button size="sm" variant="secondary" onPress={() => void load()}>Refresh</Button>}>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Revenue", value: `$${stats.totalRevenue.toFixed(2)}` },
          { label: "Refunded", value: `$${stats.totalRefunded.toFixed(2)}` },
          { label: "Successful", value: String(stats.succeeded) },
          { label: "Failed", value: String(stats.failed) },
        ].map((k) => (
          <Card key={k.label} className="p-4">
            <div className="text-xs text-default-500">{k.label}</div>
            <div className="text-xl font-bold">{k.value}</div>
          </Card>
        ))}
      </div>
      <PanelCard title="Payment history">
        <SimpleTable
          columns={["Date", "User", "Amount", "Status", "Provider", "Actions"]}
          rows={payments.map((p) => {
            const st = p.refunded ? "refunded" : p.status;
            return [
              p.created_at ? new Date(p.created_at).toLocaleDateString() : "—",
              <div key="u"><div className="font-medium">{p.user_name}</div><div className="text-xs text-default-500">{p.user_email}</div></div>,
              `$${(p.amount || 0).toFixed(2)} ${p.currency || ""}`,
              <Chip key="s" size="sm" variant="soft" color={st === "succeeded" ? "success" : st === "failed" ? "danger" : "warning"}>{st}</Chip>,
              p.provider ?? "—",
              <div key="a" className="flex gap-1">
                {p.status === "succeeded" && !p.refunded ? (
                  <Button size="sm" variant="ghost" onPress={() => void refund(p.id)}>Refund</Button>
                ) : null}
                {p.invoice_url ? (
                  <Button size="sm" variant="ghost" onPress={() => window.open(p.invoice_url!, "_blank")}>Invoice</Button>
                ) : null}
              </div>,
            ];
          })}
          empty="No payments"
        />
      </PanelCard>
    </PageShell>
  );
}
