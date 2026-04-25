import RedirectClient from "./RedirectClient";

export async function generateStaticParams() {
  return [{ id: "0" }];
}

export default function SessionAnalyticsPage({ params }: any) {
  return <RedirectClient id={params?.id} />;
}
