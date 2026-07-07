import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Donation Flow Demo | WGC",
  description: "Preview the white-label donation experience powered by WGC.",
  openGraph: {
    title: "Donation Flow Demo | WGC",
    description: "Preview the white-label donation experience powered by WGC.",
    url: "https://www.wgcpayments.com/demo/donation",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
