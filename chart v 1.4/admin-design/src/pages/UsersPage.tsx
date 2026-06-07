import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Chip, Input } from "@heroui/react";
import { chartApi } from "@/api/chartClient";
import { useAdminData } from "@/context/AdminDataContext";
import { PageShell, PanelCard } from "@/components/PageShell";
import { SimpleTable } from "@/components/SimpleTable";
import { useToast } from "@/hooks/useToast";

type UserRow = Record<string, unknown> & {
  id: number;
  email?: string;
  name?: string;
  status?: string;
  role?: string;
  has_journal_access?: boolean;
};

export function UsersPage() {
  const { setAllUsers } = useAdminData();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [eJournal, setEJournal] = useState(false);
  const [eActive, setEActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await chartApi<{ users?: UserRow[] }>("/api/admin/users");
      const list = data.users ?? [];
      setUsers(list);
      setAllUsers(list);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Load failed", "danger");
    } finally {
      setLoading(false);
    }
  }, [setAllUsers, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      if (filter && u.status !== filter) return false;
      if (!q) return true;
      return String(u.name || "").toLowerCase().includes(q) || String(u.email || "").toLowerCase().includes(q);
    });
  }, [users, search, filter]);

  const openEdit = (u: UserRow) => {
    setEditing(u);
    setEJournal(!!u.has_journal_access);
    setEActive(u.status !== "banned");
  };

  const saveUser = async () => {
    if (!editing) return;
    try {
      await chartApi(`/api/admin/users/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          has_journal_access: eJournal,
          is_active: eActive,
        }),
      });
      toast("User saved", "success");
      setEditing(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "danger");
    }
  };

  const ban = async (id: number) => {
    if (!confirm("Ban this user?")) return;
    try {
      await chartApi(`/api/admin/users/${id}/ban`, { method: "POST" });
      toast("User banned", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "danger");
    }
  };

  const unban = async (id: number) => {
    try {
      await chartApi(`/api/admin/users/${id}/unban`, { method: "POST" });
      toast("User unbanned", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "danger");
    }
  };

  const kick = async (id: number) => {
    try {
      await chartApi(`/api/admin/users/${id}/kick`, { method: "POST" });
      toast("Sessions kicked", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "danger");
    }
  };

  const del = async (id: number) => {
    if (!confirm("Delete user permanently?")) return;
    try {
      await chartApi(`/api/admin/users/${id}`, { method: "DELETE" });
      toast("User deleted", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "danger");
    }
  };

  return (
    <PageShell
      title="User Management"
      loading={loading}
      actions={<Button size="sm" variant="secondary" onPress={() => void load()}>Refresh</Button>}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Input size="sm" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <select className="rounded-lg border border-divider bg-content1 px-3 py-1.5 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
        </select>
      </div>

      <PanelCard title="Users" badge={<span className="text-xs">{filtered.length}</span>}>
        <SimpleTable
          columns={["Name", "Email", "Status", "Role", "Actions"]}
          rows={filtered.map((u) => [
            u.name ?? "—",
            u.email ?? "—",
            <Chip key="st" size="sm" color={u.status === "active" ? "success" : "danger"} variant="soft">{String(u.status || "—")}</Chip>,
            u.role === "admin" ? "Admin" : "User",
            <div key="a" className="flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" onPress={() => openEdit(u)}>Edit</Button>
              <Button size="sm" variant="ghost" onPress={() => void kick(u.id)}>Kick</Button>
              {u.status === "banned" ? (
                <Button size="sm" variant="ghost" onPress={() => void unban(u.id)}>Unban</Button>
              ) : (
                <Button size="sm" variant="ghost" onPress={() => void ban(u.id)}>Ban</Button>
              )}
              <Button size="sm" variant="danger" onPress={() => void del(u.id)}>Delete</Button>
            </div>,
          ])}
          empty="No users"
        />
      </PanelCard>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md p-6">
            <Card.Title className="text-base">Edit user</Card.Title>
            <Card.Description className="mt-1">{editing.email}</Card.Description>
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={eJournal} onChange={(e) => setEJournal(e.target.checked)} />
                Journal access
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={eActive} onChange={(e) => setEActive(e.target.checked)} />
                Active account
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onPress={() => setEditing(null)}>Cancel</Button>
              <Button variant="primary" onPress={() => void saveUser()}>Save</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </PageShell>
  );
}
