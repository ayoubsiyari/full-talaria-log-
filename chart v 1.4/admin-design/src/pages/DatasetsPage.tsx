import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Chip, Input, Tabs } from "@heroui/react";
import { chartApi, chartApiUpload } from "@/api/chartClient";
import { PageShell, PanelCard } from "@/components/PageShell";
import { SimpleTable } from "@/components/SimpleTable";
import { fmtN } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";

type Dataset = Record<string, unknown> & {
  id: number;
  symbol?: string;
  name?: string;
  status?: string;
  timeframe?: string;
};

export function DatasetsPage() {
  const { toast } = useToast();
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadPct, setUploadPct] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, ds] = await Promise.all([
        chartApi<Record<string, unknown>>("/api/admin/datasets/overview"),
        chartApi<{ datasets?: Dataset[] }>("/api/admin/datasets"),
      ]);
      setOverview(ov);
      setDatasets(ds.datasets ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Load failed", "danger");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = datasets.find((d) => d.id === selectedId);

  const deleteDs = async (id: number) => {
    if (!confirm("Delete this dataset?")) return;
    try {
      await chartApi(`/api/admin/datasets/${id}`, { method: "DELETE" });
      toast("Dataset deleted", "success");
      setSelectedId(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "danger");
    }
  };

  const syncQuest = async (id: number) => {
    try {
      await chartApi(`/api/admin/datasets/${id}/questdb-sync`, { method: "POST" });
      toast("QuestDB sync started", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "danger");
    }
  };

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    if (selectedId) fd.append("dataset_id", String(selectedId));
    try {
      setUploadPct(0);
      await chartApiUpload("/api/admin/datasets/upload", fd, setUploadPct);
      toast("Upload complete", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "danger");
    } finally {
      setUploadPct(0);
    }
  };

  const fetchDukascopy = async (symbol: string) => {
    try {
      await chartApi("/api/admin/datasets/fetch-dukascopy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      toast("Dukascopy fetch queued", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "danger");
    }
  };

  const pipelineUnstick = async () => {
    try {
      await chartApi("/api/admin/datasets/pipeline-unstick", { method: "POST" });
      toast("Pipeline unstick requested", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "danger");
    }
  };

  const ov = overview ?? {};

  return (
    <PageShell title="Dataset Management" loading={loading} actions={<Button size="sm" variant="secondary" onPress={() => void load()}>Refresh</Button>}>
      <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k))}>
        <Tabs.ListContainer>
          <Tabs.List>
            <Tabs.Tab id="overview">Overview</Tabs.Tab>
            <Tabs.Tab id="library">Library</Tabs.Tab>
            <Tabs.Tab id="import">Import</Tabs.Tab>
            <Tabs.Tab id="maintenance">Maintenance</Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="overview">
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Datasets", value: fmtN(Number(ov.dataset_count ?? datasets.length)) },
              { label: "Storage", value: String(ov.total_storage_human ?? "—") },
              { label: "Healthy", value: fmtN(Number(ov.healthy_count ?? 0)) },
              { label: "Needs attention", value: fmtN(Number(ov.needs_attention_count ?? 0)) },
            ].map((k) => (
              <Card key={k.label} className="p-4">
                <div className="text-xs text-default-500">{k.label}</div>
                <div className="text-xl font-bold">{k.value}</div>
              </Card>
            ))}
          </div>
        </Tabs.Panel>

        <Tabs.Panel id="library">
          <PanelCard title="Dataset registry" className="mt-4">
            <SimpleTable
              columns={["Symbol", "Name", "TF", "Status", "Actions"]}
              rows={datasets.map((d) => [
                d.symbol ?? "—",
                d.name ?? "—",
                d.timeframe ?? "—",
                <Chip key="s" size="sm" variant="soft">{String(d.status ?? "—")}</Chip>,
                <div key="a" className="flex gap-1">
                  <Button size="sm" variant="ghost" onPress={() => setSelectedId(d.id)}>Select</Button>
                  <Button size="sm" variant="ghost" onPress={() => void syncQuest(d.id)}>Sync</Button>
                  <Button size="sm" variant="danger" onPress={() => void deleteDs(d.id)}>Delete</Button>
                </div>,
              ])}
              empty="No datasets"
            />
            {selected ? (
              <p className="mt-3 text-sm text-default-500">Selected: {selected.symbol} (id {selected.id})</p>
            ) : null}
          </PanelCard>
        </Tabs.Panel>

        <Tabs.Panel id="import">
          <PanelCard title="Upload & fetch" className="mt-4">
            <div className="space-y-4">
              <div>
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }} />
                <Button variant="secondary" onPress={() => fileRef.current?.click()}>Upload file</Button>
                {uploadPct > 0 ? <span className="ml-2 text-sm">{uploadPct}%</span> : null}
              </div>
              <div className="flex flex-wrap gap-2 items-end">
                <Input size="sm" id="duk-symbol" placeholder="EURUSD" className="max-w-[140px]" />
                <Button size="sm" variant="ghost" onPress={() => {
                  const el = document.getElementById("duk-symbol") as HTMLInputElement | null;
                  void fetchDukascopy((el?.value || "EURUSD").trim());
                }}>Fetch Dukascopy</Button>
              </div>
            </div>
          </PanelCard>
        </Tabs.Panel>

        <Tabs.Panel id="maintenance">
          <PanelCard title="Pipeline tools" className="mt-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onPress={() => void pipelineUnstick()}>Unstick pipeline</Button>
              <Button variant="ghost" onPress={async () => {
                try {
                  const d = await chartApi<Record<string, unknown>>("/api/admin/datasets/pipeline-diagnostics");
                  toast(JSON.stringify(d).slice(0, 80), "default");
                } catch (e) {
                  toast(e instanceof Error ? e.message : "Failed", "danger");
                }
              }}>Diagnostics</Button>
            </div>
          </PanelCard>
        </Tabs.Panel>
      </Tabs>
    </PageShell>
  );
}
