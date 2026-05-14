"use client";

export default function JournalPage() {
  return (
    <iframe
      src="/journal/dashboard"
      title="Trade Journal"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
        background: "#07080E",
        display: "block",
      }}
    />
  );
}
