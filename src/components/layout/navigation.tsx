'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Upload, FileText, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  {
    href: '/',
    label: 'Upload & Process',
    icon: Upload,
  },
  {
    href: '/invoices',
    label: 'Processed Invoices',
    icon: FileText,
  },
  {
    href: '/odoo',
    label: 'Odoo Records',
    icon: LinkIcon,
  },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="bg-accent-surface rounded-xl p-2 mb-6 shadow-sm">
      <div className="flex gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200',
                isActive
                  ? 'bg-accent-action text-white'
                  : 'text-secondary-text hover:bg-accent-hover hover:text-primary-text'
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}