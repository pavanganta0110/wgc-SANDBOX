import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";

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
  title: "WGC | Payment Infrastructure for Church, Nonprofit & 501(c) Organization Software",
  description: "White-label donation engine and settlement rails for software that serves churches, nonprofits, and other 501(c) organizations. Lower fees, low-cost ACH, and PCI Level 1 security.",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "WGC | Payment Infrastructure for Church, Nonprofit & 501(c) Organization Software",
    description: "White-label donation engine and settlement rails for software that serves churches, nonprofits, and other 501(c) organizations. Lower fees, low-cost ACH, and PCI Level 1 security.",
    type: "website",
    images: ["/wgc-brand-final.png"],
    url: "https://www.wgcpayments.com/",
  },
  twitter: {
    card: "summary_large_image",
    title: "WGC | Payment Infrastructure for Church, Nonprofit & 501(c) Organization Software",
    description: "White-label donation engine and settlement rails for software that serves churches, nonprofits, and other 501(c) organizations. Lower fees, low-cost ACH, and PCI Level 1 security.",
    images: ["/wgc-brand-final.png"],
  },
  icons: {
    icon: "/favicon.ico?v=3",
  },
};

const professionalServiceSchema = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "name": "Way Point Gateway Collective",
  "url": "https://www.wgcpayments.com",
  "logo": "https://www.wgcpayments.com/wgc-brand-final.png",
  "areaServed": {
    "@type": "City",
    "name": "Kansas City"
  }
};

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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(professionalServiceSchema) }}
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
      </body>
    </html>
  );
}
