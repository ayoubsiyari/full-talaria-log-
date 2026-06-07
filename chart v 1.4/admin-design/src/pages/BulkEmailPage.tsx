import { useMemo, useState } from "react";
import { Button, Input, TextArea } from "@heroui/react";
import { chartApi } from "@/api/chartClient";
import { useAdminData } from "@/context/AdminDataContext";
import { PageShell, PanelCard } from "@/components/PageShell";
import { useToast } from "@/hooks/useToast";

export function BulkEmailPage() {
  const { allUsers } = useAdminData();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "journal" | "no-journal">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [sending, setSending] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allUsers.filter((u) => {
      if (filter === "journal" && !u.has_journal_access) return false;
      if (filter === "no-journal" && u.has_journal_access) return false;
      if (!q) return true;
      const name = String(u.name || "").toLowerCase();
      const em = String(u.email || "").toLowerCase();
      return name.includes(q) || em.includes(q);
    });
  }, [allUsers, search, filter]);

  const toggle = (email: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const selectFiltered = () => {
    setSelected(new Set(filtered.map((u) => String(u.email)).filter(Boolean)));
  };

  const send = async () => {
    const emails = [...selected];
    if (!emails.length || !subject.trim()) {
      toast("Select recipients and subject", "danger");
      return;
    }
    setSending(true);
    try {
      await chartApi("/api/admin/send-bulk-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, subject: subject.trim(), content: html }),
      });
      toast(`Queued email to ${emails.length} users`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Send failed", "danger");
    } finally {
      setSending(false);
    }
  };

  return (
    <PageShell title="Bulk email" description="Send HTML email to selected users.">
      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard
          title="Recipients"
          actions={
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onPress={selectFiltered}>Select filtered</Button>
              <Button size="sm" variant="ghost" onPress={() => setSelected(new Set())}>Clear</Button>
            </div>
          }
        >
          <div className="mb-3 flex gap-2">
            <Input size="sm" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
            <select
              className="rounded-lg border border-divider bg-content1 px-2 text-sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
            >
              <option value="all">All</option>
              <option value="journal">Journal</option>
              <option value="no-journal">No journal</option>
            </select>
          </div>
          <div className="max-h-80 overflow-y-auto space-y-1">
            {filtered.map((u) => {
              const em = String(u.email || "");
              if (!em) return null;
              return (
                <label key={em} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-default-100">
                  <input type="checkbox" checked={selected.has(em)} onChange={() => toggle(em)} />
                  <span className="truncate">{em}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-default-500">{selected.size} selected</p>
        </PanelCard>

        <PanelCard title="Message">
          <div className="space-y-3">
            <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <TextArea
              label="HTML body"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
            <Button variant="primary" isDisabled={sending} onPress={() => void send()}>
              Send email
            </Button>
          </div>
        </PanelCard>
      </div>
    </PageShell>
  );
}
