import StrategylabV9PageClient from "@/app/dashboard/strategylab-v9/StrategylabV9PageClient";

/** Strategy Lab (V9): journal strategies + chart sessions; same persistence as legacy lab (`strategy_definition` + `talaria_v9`). */
export default function DashboardStrategiesPage() {
  return <StrategylabV9PageClient />;
}
