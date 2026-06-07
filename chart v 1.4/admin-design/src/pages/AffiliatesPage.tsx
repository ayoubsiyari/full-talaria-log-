import { useCallback, useEffect, useState } from "react";
import { Button, Chip } from "@heroui/react";
import { chartApi } from "@/api/chartClient";
import { PageShell, PanelCard } from "@/components/PageShell";
import { SimpleTable } from "@/components/SimpleTable";
import { useToast } from "@/hooks/useToast";

type Affiliate = {
  id: number;
  code?: string;
  name?: string;
  email?: string;
  commission_pct?: number;
  is_active?: boolean;
  stripe_account_id?: string;
};

export function AffiliatesPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await chartApi<{ affiliates?: Affiliate[] }>("/api/admin/affiliates");
      setRows(data.affiliates ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Load failed", "danger");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const syncStripe = async (id: number) => {
    try {
      await chartApi(`/api/admin/affiliates/${id}/sync-stripe`, { method: "POST" });
      toast("Stripe sync started", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Sync failed", "danger");
    }
  };

  return (
    <PageShell
      title="Affiliates"
      loading={loading}
      actions={
        <Button size="sm" variant="secondary" onPress={() => void load()}>
          Refresh
        </Button>
      }
    >
      <PanelCard title="Affiliate partners">
        <SimpleTable
          columns={["Code", "Name", "Email", "Commission", "Status", "Actions"]}
          rows={rows.map((a) => [
            a.code ?? "—",
            a.name ?? "—",
            a.email ?? "—",
            a.commission_pct != null ? `${a.commission_pct}%` : "—",
            <Chip key="s" size="sm" color={a.is_active ? "success" : "default"} variant="soft">
              {a.is_active ? "Active" : "Inactive"}
            </Chip>,
            <Button key="a" size="sm" variant="ghost" onPress={() => void syncStripe(a.id)}>
              Sync Stripe
            </Button>,
          ])}
          empty="No affiliates"
        />
      </PanelCard>
    </PageShell>
  );
}
