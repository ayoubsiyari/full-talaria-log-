import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AdminGate } from "@/auth/AdminGate";
import { AdminShell } from "@/layout/AdminShell";
import { ToastProvider } from "@/hooks/useToast";
import { NAV_ITEMS, resolveHashRoute } from "@/routes/nav";
import { OverviewPage } from "@/pages/OverviewPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { AuditLogPage } from "@/pages/AuditLogPage";
import { SessionsPage } from "@/pages/SessionsPage";
import { FeatureFlagsPage } from "@/pages/FeatureFlagsPage";
import { SecurityLogsPage } from "@/pages/SecurityLogsPage";
import { BulkEmailPage } from "@/pages/BulkEmailPage";
import { AffiliatesPage } from "@/pages/AffiliatesPage";
import { PaymentsPage } from "@/pages/PaymentsPage";
import { SubscriptionsPage } from "@/pages/SubscriptionsPage";
import { UsersPage } from "@/pages/UsersPage";
import { InsightsPage } from "@/pages/InsightsPage";
import { SupportPage } from "@/pages/SupportPage";
import { DatasetsPage } from "@/pages/DatasetsPage";

function HashBootstrap() {
  const navigate = useNavigate();
  useEffect(() => {
    const route = resolveHashRoute(window.location.hash);
    navigate("/" + route, { replace: true });
  }, [navigate]);
  return null;
}

export default function App() {
  return (
    <ToastProvider>
      <div className="dark h-full min-h-screen">
        <AdminGate>
          {() => (
            <>
              <HashBootstrap />
              <Routes>
                <Route element={<AdminShell />}>
                  <Route index element={<Navigate to="/overview" replace />} />
                  {NAV_ITEMS.map((item) => {
                    const pages: Record<string, React.ReactNode> = {
                      overview: <OverviewPage />,
                      settings: <SettingsPage />,
                      "audit-log": <AuditLogPage />,
                      sessions: <SessionsPage />,
                      "feature-flags": <FeatureFlagsPage />,
                      "security-logs": <SecurityLogsPage />,
                      "bulk-email": <BulkEmailPage />,
                      affiliates: <AffiliatesPage />,
                      payments: <PaymentsPage />,
                      subscriptions: <SubscriptionsPage />,
                      users: <UsersPage />,
                      insights: <InsightsPage />,
                      support: <SupportPage />,
                      datasets: <DatasetsPage />,
                    };
                    return (
                      <Route key={item.id} path={item.id} element={pages[item.id]} />
                    );
                  })}
                  <Route path="*" element={<Navigate to="/overview" replace />} />
                </Route>
              </Routes>
            </>
          )}
        </AdminGate>
      </div>
    </ToastProvider>
  );
}
