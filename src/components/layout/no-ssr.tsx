'use client';

import dynamic from 'next/dynamic';
import React from 'react';

// Component to wrap content that should only render on client
export const NoSSR = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return <>{children}</>;
};

// Higher-order component for dynamic imports
export const withNoSSR = <P extends object>(
  Component: React.ComponentType<P>
) => {
  return dynamic(() => Promise.resolve(Component), {
    ssr: false,
  });
};