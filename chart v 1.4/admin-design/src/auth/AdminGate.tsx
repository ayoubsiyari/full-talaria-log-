import { useEffect, useState, type ReactNode } from "react";
import { Button, Card, Spinner } from "@heroui/react";
import { fetchAuthMe, isAdminUser } from "@/api/authMe";
import type { AuthUser } from "@/context/AdminDataContext";
import { AdminDataProvider } from "@/context/AdminDataContext";

export function AdminGate({ children }: { children: (user: AuthUser) => ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchAuthMe();
        if (cancelled) return;
        const profile = data.user;
        if (!isAdminUser(profile)) {
          setUser(null);
        } else {
          setUser(profile as AuthUser);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Auth check failed");
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md p-8 text-center">
          <Card.Header>
            <Card.Title>Admin access required</Card.Title>
            <Card.Description>
              {error
                ? error
                : "Sign in with an admin account on Talaria, then reload this page."}
            </Card.Description>
          </Card.Header>
          <Card.Footer className="justify-center">
            <Button variant="primary" onPress={() => (window.location.href = "/")}>
              Go to app
            </Button>
          </Card.Footer>
        </Card>
      </div>
    );
  }

  return <AdminDataProvider user={user}>{children(user)}</AdminDataProvider>;
}
