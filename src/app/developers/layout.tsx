import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/developers" },
  title: "Developer Docs & Payment APIs | WGC",
  description: "Integrate WGC's payment APIs with production-ready endpoints, authentication, and a familiar developer experience built for ministry software.",
  openGraph: {
    title: "Developer Docs & Payment APIs | WGC",
    description: "Integrate WGC's payment APIs with production-ready endpoints, authentication, and a familiar developer experience built for ministry software.",
    url: "https://wgcpayments.com/developers",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
