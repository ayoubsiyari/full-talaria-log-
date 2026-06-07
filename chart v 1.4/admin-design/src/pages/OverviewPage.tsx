import { Card } from "@heroui/react";
import { useAdminData } from "@/context/AdminDataContext";
import { PageShell } from "@/components/PageShell";
import { timeAgo } from "@/lib/utils";
import { NAV_ITEMS } from "@/routes/nav";
import { useNavigate } from "react-router-dom";

export function OverviewPage() {
  const { allUsers, allSessions, subStats } = useAdminData();
  const navigate = useNavigate();
  const total = allUsers.length;
  const active = allUsers.filter((u) => u.status === "active").length;
  const mrrVal = subStats?.mrr != null ? Number(subStats.mrr) : 0;
  const recent = allSessions.slice(0, 8);

  return (
    <PageShell
      title="Overview & roadmap"
      description="Platform snapshot and quick navigation to admin sections."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total users", value: total.toLocaleString(), sub: `${active.toLocaleString()} active` },
          { label: "Active sessions", value: allSessions.length.toLocaleString(), sub: "Live connections" },
          { label: "MRR", value: `$${mrrVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, sub: "Stripe snapshot" },
          { label: "Sections", value: String(NAV_ITEMS.length), sub: "Admin modules" },
        ].map((k) => (
          <Card key={k.label} className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-default-500">{k.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{k.value}</div>
            <div className="mt-1 text-xs text-default-500">{k.sub}</div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <Card.Header className="border-b border-divider px-4 py-3">
            <Card.Title className="text-sm">Recent sessions</Card.Title>
          </Card.Header>
          <Card.Content className="divide-y divide-divider p-0">
            {recent.length === 0 ? (
              <p className="p-4 text-sm text-default-500">No active sessions</p>
            ) : (
              recent.map((s, i) => {
                const diff = (Date.now() - new Date(String(s.last_active_at)).getTime()) / 1000;
                const dot =
                  diff < 120 ? "bg-success" : diff < 600 ? "bg-warning" : "bg-default-400";
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{String(s.user_name || "Unknown")}</div>
                      <div className="truncate text-xs text-default-500">
                        {String(s.ip_address || "—")} · {timeAgo(String(s.last_active_at))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </Card.Content>
        </Card>

        <Card>
          <Card.Header className="border-b border-divider px-4 py-3">
            <Card.Title className="text-sm">Quick links</Card.Title>
          </Card.Header>
          <Card.Content className="grid gap-2 sm:grid-cols-2">
            {NAV_ITEMS.filter((n) => n.id !== "overview").slice(0, 8).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate("/" + item.id)}
                className="rounded-lg border border-divider px-3 py-2 text-left text-sm hover:bg-default-100"
              >
                <div className="font-medium">{item.label}</div>
                <div className="text-xs text-default-500">{item.title}</div>
              </button>
            ))}
          </Card.Content>
        </Card>
      </div>
    </PageShell>
  );
}
