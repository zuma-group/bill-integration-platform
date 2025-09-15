'use client';

import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useInvoiceStore } from '@/store/invoice-store';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Trash2, Database } from 'lucide-react';

export default function OdooPage() {
  const { odooRecords, loadData, deleteOdooRecord } = useInvoiceStore();

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this Odoo record?')) {
      deleteOdooRecord(id);
    }
  };

  if (odooRecords.length === 0) {
    return (
      <Card>
        <CardContent className="py-16">
          <div className="text-center">
            <Database className="w-16 h-16 mx-auto text-secondary-text mb-4" />
            <h3 className="text-lg font-semibold text-primary-text mb-2">
              No bills synced to Odoo yet
            </h3>
            <p className="text-secondary-text">
              Sync invoices to see Odoo records here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Odoo Vendor Bills</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 text-sm font-semibold text-secondary-text uppercase tracking-wider">
                  Bill Number
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-secondary-text uppercase tracking-wider">
                  Vendor
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-secondary-text uppercase tracking-wider">
                  Date
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-secondary-text uppercase tracking-wider">
                  Due Date
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-secondary-text uppercase tracking-wider">
                  Total
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-secondary-text uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-secondary-text uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {odooRecords.map((record) => (
                <tr key={record.id} className="border-b hover:bg-accent-hover transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-medium text-primary-text">
                      {record.ref}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-primary-text">
                    {record.partner_id}
                  </td>
                  <td className="py-3 px-4 text-primary-text">
                    {formatDate(record.invoice_date)}
                  </td>
                  <td className="py-3 px-4 text-primary-text">
                    {formatDate(record.invoice_date_due)}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-accent-highlight">
                      {formatCurrency(record.amount_total)}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant="info" size="sm">
                      {record.state}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    <Button
                      variant="danger"
                      size="sm"
                      icon={Trash2}
                      onClick={() => handleDelete(record.id)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 pt-6 border-t">
          <div className="flex justify-between items-center">
            <div className="text-sm text-secondary-text">
              Total Records: {odooRecords.length}
            </div>
            <div className="text-lg font-semibold text-accent-highlight">
              Total Value: {formatCurrency(
                odooRecords.reduce((sum, rec) => sum + rec.amount_total, 0)
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}