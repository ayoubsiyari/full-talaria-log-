import { Suspense } from "react";
import ProfilePageClient from "./ProfilePageClient";

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="prof-settings">
          <div className="prof-loading">Loading…</div>
        </div>
      }
    >
      <ProfilePageClient />
    </Suspense>
  );
}
