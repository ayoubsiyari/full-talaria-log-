import { useCallback, useEffect, useState } from "react";
import { Button, Chip, TextArea } from "@heroui/react";
import { chartApi } from "@/api/chartClient";
import { PageShell, PanelCard } from "@/components/PageShell";
import { timeAgo, ticketRef } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { useSupportSocket } from "@/hooks/useSupportSocket";

type Thread = Record<string, unknown> & {
  id: number;
  subject?: string;
  status?: string;
  user_name?: string;
  user_email?: string;
  needs_staff_reply?: boolean;
  staff_unread?: boolean;
  category?: string;
  last_message_at?: string;
};

type Message = {
  id: number;
  sender_user_id: number;
  body: string;
  is_internal?: boolean;
  created_at?: string;
};

export function SupportPage() {
  const { toast } = useToast();
  const [inbox, setInbox] = useState<Thread[]>([]);
  const [userReplies, setUserReplies] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);

  const selected = [...inbox, ...userReplies].find((t) => t.id === selectedId) ?? null;

  const loadInbox = useCallback(async () => {
    const params = new URLSearchParams({ limit: "500", exclude_status: "user_replied", sort: "activity" });
    const data = await chartApi<{ threads?: Thread[] }>(`/api/admin/support/threads?${params}`);
    setInbox(data.threads ?? []);
  }, []);

  const loadUserReplies = useCallback(async () => {
    const params = new URLSearchParams({ limit: "200", status: "user_replied", sort: "activity" });
    const data = await chartApi<{ threads?: Thread[] }>(`/api/admin/support/threads?${params}`);
    setUserReplies(data.threads ?? []);
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const s = await chartApi<Record<string, unknown>>("/api/admin/support/stats");
      setStats(s);
    } catch {
      /* ignore */
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadInbox(), loadUserReplies(), loadStats()]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Load failed", "danger");
    } finally {
      setLoading(false);
    }
  }, [loadInbox, loadUserReplies, loadStats, toast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const { subscribeThread } = useSupportSocket((d) => {
    if (d.type === "notification_ping") void loadAll();
    if (d.type === "message" && d.thread_id === selectedId) {
      void loadMessages(selectedId!);
    }
  }, true);

  useEffect(() => {
    subscribeThread(selectedId);
  }, [selectedId, subscribeThread]);

  const loadMessages = async (id: number) => {
    const data = await chartApi<{ messages?: Message[] }>(`/api/support/threads/${id}/messages?limit=200`);
    setMessages(data.messages ?? []);
    await chartApi(`/api/support/threads/${id}/read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  };

  const selectThread = async (id: number) => {
    setSelectedId(id);
    try {
      await loadMessages(id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "danger");
    }
  };

  const patchStatus = async (status: string) => {
    if (!selectedId) return;
    try {
      await chartApi(`/api/admin/support/threads/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      toast("Ticket updated", "success");
      await loadAll();
      if (selectedId) await selectThread(selectedId);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "danger");
    }
  };

  const sendReply = async () => {
    if (!selectedId || !reply.trim()) return;
    try {
      await chartApi(`/api/admin/support/threads/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.trim(), is_internal: false }),
      });
      setReply("");
      await loadMessages(selectedId);
      await loadAll();
      toast("Reply sent", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Send failed", "danger");
    }
  };

  const ThreadRow = ({ t, active }: { t: Thread; active: boolean }) => (
    <button
      type="button"
      onClick={() => void selectThread(t.id)}
      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
        active ? "border-primary bg-primary/10" : "border-divider hover:bg-default-100"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium truncate">{ticketRef(t.id)}</span>
        <span className="text-xs text-default-500 shrink-0">{timeAgo(t.last_message_at)}</span>
      </div>
      <div className="truncate text-default-600">{t.subject}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {t.needs_staff_reply ? <Chip size="sm" variant="soft" color="warning">Reply</Chip> : null}
        {t.staff_unread ? <Chip size="sm" variant="soft">Unread</Chip> : null}
        <Chip size="sm" variant="soft">{String(t.status)}</Chip>
      </div>
    </button>
  );

  return (
    <PageShell
      title="Support"
      description={`Open ${stats?.open ?? "—"} · User replied ${stats?.user_replied ?? "—"}`}
      loading={loading}
      actions={<Button size="sm" variant="secondary" onPress={() => void loadAll()}>Refresh</Button>}
    >
      <div className="grid h-[calc(100vh-12rem)] min-h-[480px] gap-4 lg:grid-cols-[280px_280px_1fr]">
        <PanelCard title="Inbox" badge={<Chip size="sm">{inbox.length}</Chip>} className="flex flex-col overflow-hidden">
          <div className="flex-1 space-y-2 overflow-y-auto">
            {inbox.map((t) => (
              <ThreadRow key={t.id} t={t} active={t.id === selectedId} />
            ))}
            {!inbox.length ? <p className="text-sm text-default-500">No tickets</p> : null}
          </div>
        </PanelCard>

        <PanelCard title="User replies after resolve" badge={<Chip size="sm">{userReplies.length}</Chip>} className="flex flex-col overflow-hidden">
          <div className="flex-1 space-y-2 overflow-y-auto">
            {userReplies.map((t) => (
              <ThreadRow key={t.id} t={t} active={t.id === selectedId} />
            ))}
            {!userReplies.length ? <p className="text-sm text-default-500">No user replies</p> : null}
          </div>
        </PanelCard>

        <PanelCard
          title={selected ? `${ticketRef(selected.id)} · ${selected.subject}` : "Select a ticket"}
          actions={
            selected ? (
              <div className="flex flex-wrap gap-1">
                {selected.status === "user_replied" ? (
                  <Button size="sm" variant="primary" onPress={() => void patchStatus("open")}>Add to queue</Button>
                ) : null}
                <Button size="sm" variant="ghost" onPress={() => void patchStatus("resolved")}>Resolve</Button>
                <Button size="sm" variant="ghost" onPress={() => void patchStatus("closed")}>Close</Button>
              </div>
            ) : null
          }
          className="flex flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-[200px]">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-lg px-3 py-2 text-sm ${
                  m.is_internal ? "bg-warning/10 border border-warning/20" : "bg-default-100"
                }`}
              >
                <div className="text-xs text-default-500 mb-1">
                  {m.is_internal ? "Internal" : "Message"} · {m.created_at ? timeAgo(m.created_at) : ""}
                </div>
                <div className="whitespace-pre-wrap">{m.body}</div>
              </div>
            ))}
            {!messages.length && selected ? <p className="text-sm text-default-500">No messages</p> : null}
          </div>
          {selected && selected.status !== "closed" ? (
            <div className="space-y-2 border-t border-divider pt-3">
              <TextArea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to user…" rows={3} />
              <Button variant="primary" onPress={() => void sendReply()}>Send</Button>
            </div>
          ) : null}
        </PanelCard>
      </div>
    </PageShell>
  );
}
