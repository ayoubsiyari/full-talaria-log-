import { Card } from "@heroui/react";
import { useAdminData } from "@/context/AdminDataContext";
import { PageShell } from "@/components/PageShell";

export function SettingsPage() {
  const { allUsers, allSessions } = useAdminData();

  return (
    <PageShell title="Settings" description="Admin workspace info (client-side snapshot).">
      <Card className="max-w-xl p-6">
        <Card.Title className="text-base">Cached data</Card.Title>
        <Card.Description className="mt-2 text-sm">
          Users loaded: <strong>{allUsers.length}</strong>
          <br />
          Sessions loaded: <strong>{allSessions.length}</strong>
          <br />
          Build: <strong>heroui-admin-v1</strong>
        </Card.Description>
      </Card>
    </PageShell>
  );
}
