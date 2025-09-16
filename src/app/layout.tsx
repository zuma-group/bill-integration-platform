import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClientLayout } from "@/components/layout/client-layout";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Invoice OCR to Odoo Pipeline",
  description: "Extract invoice data using OCR and sync with Odoo",
};

// Disable static optimization for this layout
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            // Remove browser extension attributes that cause hydration issues
            if (typeof window !== 'undefined') {
              const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                  if (mutation.type === 'attributes' && mutation.attributeName === 'bis_skin_checked') {
                    mutation.target.removeAttribute('bis_skin_checked');
                  }
                });
              });
              observer.observe(document.documentElement, {
                attributes: true,
                subtree: true,
                attributeFilter: ['bis_skin_checked']
              });
            }
          `
        }} />
      </head>
      <body className={`${inter.className} bg-primary-bg antialiased`} suppressHydrationWarning>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
