import type { Metadata } from "next";
import { graph } from "@/lib/schema";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import MetaPixel from "@/components/common/MetaPixel";
import SimplifiPixel from "@/components/common/SimplifiPixel";
import CookieConsentBanner from "@/components/common/CookieConsentBanner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.wgcpayments.com"),
  title: "WGC | Fundraising, Payments & Donor Management for Nonprofits",
  description: "Accept donations, track donor giving history, launch campaigns, automate recurring giving, send invoices, and track every gift from one dashboard. Built for nonprofits, churches, foundations, associations, and schools. $0 processing cost when donors cover the fee, simple $10/month platform fee.",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "WGC | Fundraising, Payments & Donor Management for Nonprofits",
    description: "Accept donations, track donor giving history, launch campaigns, automate recurring giving, send invoices, and track every gift from one dashboard. Built for nonprofits, churches, foundations, associations, and schools.",
    type: "website",
    images: [{ url: "/og/default.png", width: 1200, height: 630 }],
    url: "https://www.wgcpayments.com/",
  },
  twitter: {
    card: "summary_large_image",
    title: "WGC | Fundraising, Payments & Donor Management for Nonprofits",
    description: "Accept donations, track donor giving history, launch campaigns, automate recurring giving, send invoices, and track every gift from one dashboard. Built for nonprofits, churches, foundations, associations, and schools.",
    images: ["/og/default.png"],
  },
  icons: {
    icon: "/favicon.ico?v=4",
  },
};

const siteSchema = graph();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-wgc-off text-wgc-navy-900">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteSchema) }}
        />
        {children}
        <Toaster 
          position="bottom-right" 
          toastOptions={{
            duration: 4000,
            style: {
              background: '#fff',
              color: '#0F172A',
              borderRadius: '16px',
              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
              border: '1px solid #E2E8F0',
              padding: '16px 20px',
              fontSize: '14px',
              fontWeight: '600',
              fontFamily: 'var(--font-inter)',
            },
            success: {
              iconTheme: {
                primary: '#16A34A',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#DC2626',
                secondary: '#fff',
              },
            },
          }}
        />
        <MetaPixel />
        <SimplifiPixel />
        <CookieConsentBanner />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
