import { redirect } from "next/navigation";

/** Legacy URL — Strategy Lab lives at `/dashboard/strategies/`. */
export default function StrategylabV9LegacyRedirectPage() {
  redirect("/dashboard/strategies/");
}
