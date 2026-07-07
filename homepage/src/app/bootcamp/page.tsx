"use client";

// Mentorship/bootcamp is disabled for now. This route redirects to the homepage
// so existing links don't 404. The full page is preserved in git history — to
// bring it back, restore the previous version of this file and re-add the
// homepage Mentorship button in HomePageClient.tsx.
import React from "react";
import { useRouter } from "next/navigation";

export default function BootcampPage() {
  const router = useRouter();

  React.useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060912] text-white/70">
      Redirecting…
    </div>
  );
}
