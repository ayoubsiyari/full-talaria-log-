import { redirect } from "next/navigation";

/** V8 preview removed; Strategy Lab is `/dashboard/strategies/`. */
export default function StrategyV8LabPreviewRedirectPage() {
  redirect("/dashboard/strategies/");
}
