import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button, Chip } from "@heroui/react";
import { ExternalLink, LogOut } from "lucide-react";
import { useAdminData } from "@/context/AdminDataContext";
import { NAV_ITEMS, resolveHashRoute } from "@/routes/nav";
import { useToast } from "@/hooks/useToast";

export function AdminShell() {
  const { user, refreshCore } = useAdminData();
  const navigate = useNavigate();
  const location = useLocation();
  const { state: toastState } = useToast();
  const [pageTitle, setPageTitle] = useState("Overview");

  const currentId = location.pathname.replace(/^\//, "") || "overview";

  useEffect(() => {
    void refreshCore();
    const id = setInterval(() => void refreshCore(), 60000);
    return () => clearInterval(id);
  }, [refreshCore]);

  useEffect(() => {
    const syncHash = () => {
      const route = resolveHashRoute(window.location.hash);
      if (route !== currentId) navigate("/" + route, { replace: true });
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [currentId, navigate]);

  useEffect(() => {
    const item = NAV_ITEMS.find((n) => n.id === currentId);
    setPageTitle(item?.title ?? currentId);
    if (window.location.hash !== `#${currentId}` && !window.location.hash.startsWith("#sec-")) {
      window.history.replaceState(null, "", `#${currentId}`);
    }
  }, [currentId]);

  return (
    <div className="flex h-full min-h-0 bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r border-divider bg-content1">
        <div className="flex items-center gap-3 border-b border-divider px-4 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
            T
          </div>
          <div>
            <div className="text-sm font-bold">Talaria</div>
            <div className="text-xs text-default-500">Admin</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = currentId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate("/" + item.id)}
                className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
                  active
                    ? "bg-primary/15 font-medium text-primary"
                    : "text-default-500 hover:bg-default-100 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="flex items-center gap-2 border-t border-divider px-4 py-3 text-xs">
          <span className="h-2 w-2 rounded-full bg-success" />
          <span className="truncate text-default-600">{user.name || user.email || "Admin"}</span>
          <Chip size="sm" variant="soft" color="primary" className="ml-auto">
            Admin
          </Chip>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-divider px-6">
          <h2 className="flex-1 text-base font-semibold">{pageTitle}</h2>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => window.open("/", "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            App
          </Button>
          <Button size="sm" variant="ghost" onPress={() => (window.location.href = "/")}>
            <LogOut className="h-3.5 w-3.5" />
            Exit
          </Button>
        </header>

        {toastState ? (
          <div
            className={`mx-4 mt-3 rounded-lg px-4 py-2 text-sm ${
              toastState.type === "success"
                ? "bg-success/15 text-success"
                : toastState.type === "danger"
                  ? "bg-danger/15 text-danger"
                  : "bg-default-100 text-foreground"
            }`}
          >
            {toastState.message}
          </div>
        ) : null}

        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
