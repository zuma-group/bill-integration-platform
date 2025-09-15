'use client';

import React, { useEffect, useState } from 'react';
import { Header } from './header';
import { Navigation } from './navigation';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Return a placeholder during SSR to avoid hydration mismatch
    return (
      <div className="min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-accent-surface rounded-xl shadow-sm p-6 mb-6 h-24 animate-pulse" />
          <div className="bg-accent-surface rounded-xl p-2 mb-6 h-14 animate-pulse" />
          <main>{children}</main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Header />
        <Navigation />
        <main>{children}</main>
      </div>
    </div>
  );
}