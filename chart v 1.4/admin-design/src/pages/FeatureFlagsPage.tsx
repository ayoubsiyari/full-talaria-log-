import { useCallback, useEffect, useState } from "react";
import { Button, Switch } from "@heroui/react";
import { journalApi } from "@/api/journalClient";
import { PageShell, PanelCard } from "@/components/PageShell";
import { useToast } from "@/hooks/useToast";

type Flag = {
  id: number;
  name: string;
  enabled: boolean;
  description?: string;
  category?: string;
};

export function FeatureFlagsPage() {
  const { toast } = useToast();
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await journalApi<{ flags?: Flag[] }>("/journal/api/feature-flags");
      setFlags(data.flags ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Load failed", "danger");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (f: Flag) => {
    try {
      await journalApi(`/journal/api/feature-flags/${f.name}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !f.enabled }),
      });
      setFlags((prev) => prev.map((x) => (x.id === f.id ? { ...x, enabled: !x.enabled } : x)));
      toast("Flag updated", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Toggle failed", "danger");
    }
  };

  const categories = [...new Set(flags.map((f) => f.category || "general"))];

  return (
    <PageShell
      title="Feature Flags"
      description="Journal backend feature toggles."
      loading={loading}
      actions={
        <Button size="sm" variant="secondary" onPress={() => void load()}>
          Refresh
        </Button>
      }
    >
      {categories.map((cat) => {
        const group = flags.filter((f) => (f.category || "general") === cat);
        if (!group.length) return null;
        return (
          <PanelCard key={cat} title={cat} className="mb-4">
            <div className="space-y-3">
              {group.map((f) => (
                <div key={f.id} className="flex items-start justify-between gap-4 rounded-lg border border-divider p-3">
                  <div>
                    <div className="font-medium text-sm">{f.name}</div>
                    {f.description ? (
                      <div className="mt-1 text-xs text-default-500">{f.description}</div>
                    ) : null}
                  </div>
                  <Switch isSelected={f.enabled} onChange={() => void toggle(f)}>
                    {f.enabled ? "On" : "Off"}
                  </Switch>
                </div>
              ))}
            </div>
          </PanelCard>
        );
      })}
      {!loading && !flags.length ? (
        <p className="text-sm text-default-500">No feature flags found.</p>
      ) : null}
    </PageShell>
  );
}
