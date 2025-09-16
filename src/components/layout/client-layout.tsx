'use client';

import React from 'react';
import dynamic from 'next/dynamic';

// Dynamically import components to avoid SSR issues
const Header = dynamic(() => import('./header').then(mod => ({ default: mod.Header })), {
  ssr: false,
  loading: () => <div className="bg-accent-surface rounded-xl shadow-sm p-6 mb-6 h-24 animate-pulse" />
});

const Navigation = dynamic(() => import('./navigation').then(mod => ({ default: mod.Navigation })), {
  ssr: false,
  loading: () => <div className="bg-accent-surface rounded-xl p-2 mb-6 h-14 animate-pulse" />
});

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" suppressHydrationWarning>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" suppressHydrationWarning>
        <Header />
        <Navigation />
        <main suppressHydrationWarning>{children}</main>
      </div>
    </div>
  );
}