import { Card, Spinner } from "@heroui/react";
import type { ReactNode } from "react";

export function PageShell({
  title,
  description,
  actions,
  loading,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-default-500">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export function PanelCard({
  title,
  badge,
  actions,
  children,
  className = "",
}: {
  title: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <Card.Header className="flex flex-row items-center gap-2 border-b border-divider px-4 py-3">
        <Card.Title className="flex-1 text-sm font-semibold">{title}</Card.Title>
        {badge}
        {actions}
      </Card.Header>
      <Card.Content className="p-4">{children}</Card.Content>
    </Card>
  );
}
