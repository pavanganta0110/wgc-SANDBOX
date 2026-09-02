"use client";

import { Suspense } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AuthOptions from "@/components/auth/AuthOptions";

export default function SixMonthsFreeSignupPage() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header />
      <main className="flex-grow max-w-md w-full mx-auto py-24 px-6">
        <Suspense fallback={<div className="text-center py-12 text-slate-500">Loading...</div>}>
          <AuthOptions
            mode="signup"
            promotion="SIX_MONTHS_FREE"
            redirectTo="/start"
            heading="WGC Payments Promotion"
            subheading="Get 90 days of free credit card processing. Sign up with Google, Apple, or email below."
            emailSignupVisible={true}
            emailLoginVisible={false}
          />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
