"use client";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AuthOptions from "@/components/auth/AuthOptions";

export default function SixMonthsFreePage() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header />
      <main className="flex-grow max-w-md w-full mx-auto py-24 px-6">
        <AuthOptions
          mode="signup"
          promotion="SIX_MONTHS_FREE"
          heading="WGC Payments Promotion"
          subheading="Get six months of free credit card processing. Sign up with Google, Apple, or email below."
          emailSignupVisible={true}
          emailLoginVisible={false}
        />
      </main>
      <Footer />
    </div>
  );
}
