import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PlanningCenter from "@/components/marketing/planning-center/PlanningCenter";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Planning Center giving with WGC | WGC Payments",
  description:
    "Keep Planning Center. WGC processes your online giving and sends each gift to the right person and fund in Planning Center, with the processing fee covered by your givers by default.",
  alternates: { canonical: "/planning-center" },
  // Held back from search engines until the Planning Center gift sync is generally available and the copy
  // has been checked against it. Remove this line to publish (and add the page to the sitemap and navigation).
  robots: { index: false, follow: false },
};

// Same booking embed as /time-back.
const CALENDLY_EMBED_URL = "https://calendly.com/waypoint-gateway-collective/1-1-wgc-first-look-2?hide_gdpr_banner=1&primary_color=ca8a04";

export default function PlanningCenterPage() {
  return (
    <>
      <Header />
      <main className="flex-grow">
        <PlanningCenter calendlyUrl={CALENDLY_EMBED_URL} />
      </main>
      <Footer />
    </>
  );
}
