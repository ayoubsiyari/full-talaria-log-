import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, Tabs } from "@heroui/react";
import { chartApi } from "@/api/chartClient";
import { useAdminData } from "@/context/AdminDataContext";
import { PageShell, PanelCard } from "@/components/PageShell";
import { SimpleTable } from "@/components/SimpleTable";
import { useToast } from "@/hooks/useToast";

type Plan = { id: number; name?: string; price_monthly?: number; price_yearly?: number; is_active?: boolean; subscriber_count?: number };
type Sub = { id: number; user_email?: string; plan_name?: string; status?: string; current_period_end?: string };

export function SubscriptionsPage() {
  const { subStats, setSubStats } = useAdminData();
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s, st] = await Promise.all([
        chartApi<{ plans?: Plan[] }>("/api/admin/subscriptions/plans"),
        chartApi<{ subscriptions?: Sub[] }>("/api/admin/subscriptions"),
        chartApi<Record<string, unknown>>("/api/admin/subscriptions/stats"),
      ]);
      setPlans(p.plans ?? []);
      setSubs(s.subscriptions ?? []);
      setSubStats(st);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Load failed", "danger");
    } finally {
      setLoading(false);
    }
  }, [setSubStats, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancelSub = async (id: number) => {
    if (!confirm("Cancel this subscription?")) return;
    try {
      await chartApi(`/api/admin/subscriptions/${id}/cancel`, { method: "POST" });
      toast("Subscription canceled", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "danger");
    }
  };

  const s = subStats ?? {};

  return (
    <PageShell title="Subscriptions" loading={loading} actions={<Button size="sm" variant="secondary" onPress={() => void load()}>Refresh</Button>}>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Active subs", value: String(s.active_subscriptions ?? 0) },
          { label: "MRR", value: `$${Number(s.mrr ?? 0).toLocaleString()}` },
          { label: "Canceled", value: String(s.canceled_subscriptions ?? 0) },
          { label: "Journal users", value: String(s.journal_access_users ?? 0) },
        ].map((k) => (
          <Card key={k.label} className="p-4">
            <div className="text-xs text-default-500">{k.label}</div>
            <div className="text-xl font-bold">{k.value}</div>
          </Card>
        ))}
      </div>

      <Tabs defaultSelectedKey="plans">
        <Tabs.ListContainer>
          <Tabs.List>
            <Tabs.Tab id="plans">Plans</Tabs.Tab>
            <Tabs.Tab id="subs">Subscriptions</Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="plans">
          <PanelCard title="Plans" className="mt-4">
            <SimpleTable
              columns={["Name", "Monthly", "Yearly", "Subscribers", "Status"]}
              rows={plans.map((p) => [
                p.name ?? "—",
                `$${(p.price_monthly || 0).toFixed(2)}`,
                `$${(p.price_yearly || 0).toFixed(2)}`,
                String(p.subscriber_count ?? 0),
                <Chip key="s" size="sm" color={p.is_active ? "success" : "default"}>{p.is_active ? "Active" : "Inactive"}</Chip>,
              ])}
              empty="No plans"
            />
          </PanelCard>
        </Tabs.Panel>
        <Tabs.Panel id="subs">
          <PanelCard title="Subscriptions" className="mt-4">
            <SimpleTable
              columns={["User", "Plan", "Status", "Period end", "Actions"]}
              rows={subs.map((sub) => [
                sub.user_email ?? "—",
                sub.plan_name ?? "—",
                sub.status ?? "—",
                sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "—",
                <Button key="c" size="sm" variant="danger" onPress={() => void cancelSub(sub.id)}>Cancel</Button>,
              ])}
              empty="No subscriptions"
            />
          </PanelCard>
        </Tabs.Panel>
      </Tabs>
    </PageShell>
  );
}
