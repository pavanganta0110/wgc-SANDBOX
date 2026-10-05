import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/developers" },
  title: "Platform Architecture for Software Partners | WGC",
  description: "How WGC's payment infrastructure works for software platforms serving nonprofits — merchant onboarding, payments, and recurring giving, integrated today through a guided partnership.",
  openGraph: {
    images: [{ url: "/og/default.png", width: 1200, height: 630 }],
    title: "Platform Architecture for Software Partners | WGC",
    description: "How WGC's payment infrastructure works for software platforms serving nonprofits, integrated today through a guided partnership.",
    url: "https://www.wgcpayments.com/developers",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
