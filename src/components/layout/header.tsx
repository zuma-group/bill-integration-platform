'use client';

import React, { useEffect, useState } from 'react';
import { FileText, TrendingUp, CheckCircle, Coins } from 'lucide-react';
import { useInvoiceStore } from '@/store/invoice-store';
import { formatCurrency } from '@/lib/utils';

export function Header() {
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState({
    totalInvoices: 0,
    extractedCount: 0,
    syncedCount: 0,
    totalValue: 0,
  });

  useEffect(() => {
    setMounted(true);

    // Load data once on mount
    const store = useInvoiceStore.getState();
    store.loadData();

    // Subscribe to store changes
    const unsubscribe = useInvoiceStore.subscribe((state) => {
      setStats({
        totalInvoices: state.invoices.length,
        extractedCount: state.invoices.filter(inv => inv.status === 'extracted').length,
        syncedCount: state.invoices.filter(inv => inv.status === 'synced').length,
        totalValue: state.invoices.reduce((sum, inv) => sum + inv.total, 0),
      });
    });

    // Set initial stats
    const initialState = useInvoiceStore.getState();
    setStats({
      totalInvoices: initialState.invoices.length,
      extractedCount: initialState.invoices.filter(inv => inv.status === 'extracted').length,
      syncedCount: initialState.invoices.filter(inv => inv.status === 'synced').length,
      totalValue: initialState.invoices.reduce((sum, inv) => sum + inv.total, 0),
    });

    return () => unsubscribe();
  }, []);

  const statsDisplay = [
    {
      label: 'Total Invoices',
      value: mounted ? stats.totalInvoices : 0,
      icon: FileText,
      color: 'text-accent-highlight',
    },
    {
      label: 'Extracted',
      value: mounted ? stats.extractedCount : 0,
      icon: TrendingUp,
      color: 'text-status-warning',
    },
    {
      label: 'Synced to Odoo',
      value: mounted ? stats.syncedCount : 0,
      icon: CheckCircle,
      color: 'text-status-success',
    },
    {
      label: 'Total Value',
      value: mounted ? formatCurrency(stats.totalValue) : '',
      icon: Coins,
      color: 'text-accent-action',
    },
  ];

  return (
    <header className="bg-accent-surface rounded-xl shadow-sm p-6 mb-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-primary-text flex items-center gap-2">
            <FileText className="w-8 h-8 text-accent-action" />
            Invoice OCR to Odoo Pipeline
          </h1>
          <p className="text-secondary-text mt-1">
            Extract invoice data and sync with Odoo seamlessly
          </p>
        </div>

        <div className="flex gap-6">
          {statsDisplay.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="text-center">
                <div className="flex items-center justify-center mb-1">
                  <Icon className={`w-5 h-5 ${stat.color} mr-1`} />
                  <div className={`text-2xl font-bold ${stat.color}`}>
                    {stat.value}
                  </div>
                </div>
                <div className="text-xs text-secondary-text uppercase tracking-wide">
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </header>
  );
}