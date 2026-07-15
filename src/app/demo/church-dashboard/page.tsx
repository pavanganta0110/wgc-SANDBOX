"use client";

import { formatCents } from "@/lib/format";
import { useState, useEffect } from "react";
import Link from "next/link";
import { DollarSign, Users, PiggyBank, Briefcase, Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Mock data for the demo
const MOCK_STATS = {
  totalVolume: 4256050, // $42,560.50
  donationCount: 156,
  averageDonation: 27282, // $272.82
  volumeByFund: [
    { name: "General Giving", amount: 2845010 },
    { name: "Missions", amount: 841040 },
    { name: "Global Relief", amount: 570000 },
  ],
  recentDonations: [
    { date: new Date().toISOString(), donor: "Johnathan Doe", fund: "General Giving", amount: 25000 },
    { date: new Date(Date.now() - 3600000).toISOString(), donor: "Sarah Miller", fund: "Missions", amount: 10000 },
    { date: new Date(Date.now() - 7200000).toISOString(), donor: "Michael Thompson", fund: "General Giving", amount: 50000 },
    { date: new Date(Date.now() - 10800000).toISOString(), donor: "Grace Family Trust", fund: "Global Relief", amount: 100000 },
    { date: new Date(Date.now() - 14400000).toISOString(), donor: "Esther Williams", fund: "General Giving", amount: 15000 },
  ]
};

export default function DemoDashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<typeof MOCK_STATS | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setStats(MOCK_STATS);
      setIsLoading(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="bg-slate-50 min-h-screen py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* Top Note */}
        <div className="mb-12 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white text-wgc-gold-500 text-[10px] font-bold tracking-widest uppercase mb-4 font-mono border border-wgc-gold-500/20">
            Preview Environment
          </div>
          <h1 className="text-3xl font-bold text-wgc-navy-900 tracking-tight">What your admins will see</h1>
          <p className="mt-2 text-lg text-slate-500 font-medium tracking-tight opacity-80">A clean, focused dashboard powered by WGC infrastructure, styled to match your software.</p>
        </div>

        {/* The Mock Dashboard Surface */}
        <div className="bg-white rounded-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-slate-200 overflow-hidden ring-1 ring-slate-100">
          
          {/* Fake Nav Bar within the mock */}
          <div className="border-b border-slate-100 bg-slate-50/50 px-8 py-5 flex justify-between items-center bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%23f1f5f9%22%20stroke-width%3D%221.5%22%20d%3D%22M1%201h18v18H1z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:20px_20px]">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-wgc-gold-500 font-bold shadow-lg border border-wgc-gold-500/20">C</div>
              <span className="font-bold text-wgc-navy-900 tracking-tight">ChurchSoft Admin</span>
            </div>
            <div className="hidden sm:block text-[10px] font-bold text-wgc-navy-500 uppercase tracking-[0.2em] font-mono animate-pulse">Read-only preview protocol</div>
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center border-2 border-white shadow-sm overflow-hidden">
              <Users className="w-5 h-5 text-wgc-navy-500" />
            </div>
          </div>

          <div className="p-8 md:p-12 bg-white relative min-h-[500px]">
            
            {/* Loading State */}
            {isLoading && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center animate-in fade-in duration-300">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mx-auto mb-4 shadow-xl border border-wgc-gold-500/20">
                    <Loader2 className="w-8 h-8 text-wgc-gold-500 animate-spin" />
                  </div>
                  <p className="text-sm font-bold text-wgc-navy-900 uppercase tracking-widest font-mono">Loading data rails...</p>
                </div>
              </div>
            )}
 
            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
              {[
                { label: "Total Giving", value: formatCents(stats?.totalVolume || 0), icon: DollarSign },
                { label: "Total Donors", value: stats?.donationCount || 0, icon: Users },
                { label: "Avg Donation", value: formatCents(stats?.averageDonation || 0), icon: PiggyBank },
                { label: "Active Funds", value: stats?.volumeByFund?.length || 0, icon: Briefcase },
              ].map((item, i) => (
                <div key={item.label} className="bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-sm transition-transform hover:-translate-y-1">
                  <div className="flex items-center text-wgc-navy-500 mb-4">
                    <item.icon className="w-4 h-4 mr-2 text-wgc-gold-600" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] font-mono">{item.label}</span>
                  </div>
                  <div className="text-2xl font-bold text-wgc-navy-900 tracking-tighter">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              
              {/* Recent Donations Table */}
              <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center">
                  <h3 className="font-bold text-wgc-navy-900 tracking-tight">Recent Donations</h3>
                  <button className="text-[10px] font-bold text-wgc-gold-600 uppercase tracking-widest hover:text-black transition-colors font-mono">View Ledger →</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-50">
                    <thead className="bg-slate-50/50">
                      <tr>
                        {["Date", "Donor", "Fund", "Amount", "Status"].map((h) => (
                          <th key={h} className="px-8 py-4 text-left text-[10px] font-bold text-wgc-navy-500 uppercase tracking-widest font-mono">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-50 font-bold">
                      {stats?.recentDonations.map((tx, i) => (
                        <tr key={i} className="hover:bg-slate-50/30 transition-colors">
                          <td className="px-8 py-5 whitespace-nowrap text-xs text-slate-500 font-mono">{formatDate(tx.date)}</td>
                          <td className="px-8 py-5 whitespace-nowrap text-sm text-wgc-navy-900 tracking-tight">{tx.donor}</td>
                          <td className="px-8 py-5 whitespace-nowrap text-xs text-wgc-navy-500 uppercase tracking-tight">{tx.fund}</td>
                          <td className="px-8 py-5 whitespace-nowrap text-sm text-wgc-navy-900 font-bold tracking-tight">{formatCents(tx.amount)}</td>
                          <td className="px-8 py-5 whitespace-nowrap">
                            <span className="px-3 py-1 inline-flex text-[9px] font-bold uppercase tracking-widest rounded-full bg-green-50 text-green-600 border border-green-100 font-mono">
                              Settled
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sidebar Info */}
              <div className="space-y-6">
                {/* Live Activity Card */}
                <div className="bg-slate-950 p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
                  <div className="absolute -bottom-4 -right-4 opacity-[0.05] pointer-events-none select-none text-8xl font-bold text-wgc-gold-500 leading-none">✝</div>
                  <h3 className="font-bold text-wgc-navy-900 mb-8 tracking-tight relative z-10">Live Activity</h3>
                  <div className="space-y-6 relative z-10">
                     {stats?.volumeByFund.map((fund) => (
                        <div key={fund.name} className="flex flex-col gap-2">
                           <div className="flex justify-between items-center">
                             <div className="text-[10px] font-bold text-wgc-navy-500 uppercase tracking-widest font-mono">{fund.name}</div>
                             <div className="text-sm font-bold text-wgc-gold-500 tracking-tight">{formatCents(fund.amount)}</div>
                           </div>
                           <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-wgc-gold-500 to-amber-600 rounded-full transition-all duration-1000" 
                                style={{ width: `${(fund.amount / (stats?.totalVolume || 1)) * 100}%` }}
                              ></div>
                           </div>
                        </div>
                     ))}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Below the mocked dashboard */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-4 bg-white px-8 py-4 rounded-2xl border border-wgc-gold-500/20 shadow-2xl animate-in slide-in-from-bottom-8 duration-700">
            <div className="w-2 h-2 rounded-full bg-wgc-gold-500 animate-ping"></div>
            <p className="text-sm font-bold text-wgc-navy-600 uppercase tracking-widest font-mono">
              Live preview fetching data from the <span className="text-wgc-gold-500">WGC Ministry API</span>.
            </p>
          </div>
        </div>

        <div className="mt-16 text-center">
          <Link href="/contact" className="inline-flex items-center justify-center px-10 py-5 bg-gradient-to-br from-wgc-gold-500 to-amber-600 rounded-2xl text-sm font-bold text-wgc-navy-900 uppercase tracking-[0.2em] shadow-2xl transform transition-all hover:scale-105 active:scale-95 shadow-wgc-gold-500/20">
            Book a Call for Demo <ArrowRight className="ml-3 w-5 h-5" />
          </Link>
        </div>

      </div>
    </div>
  );
}
