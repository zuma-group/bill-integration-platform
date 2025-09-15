'use client';

import React from 'react';
import { Upload, ScanSearch, Cpu, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PipelineStep, PipelineStatus } from '@/types';
import { useInvoiceStore } from '@/store/invoice-store';

const steps: {
  id: PipelineStep;
  icon: React.ElementType;
  title: string;
}[] = [
  { id: 'upload', icon: Upload, title: 'Upload File' },
  { id: 'ocr', icon: ScanSearch, title: 'OCR Extraction' },
  { id: 'processing', icon: Cpu, title: 'Data Processing' },
  { id: 'ready', icon: CheckCircle2, title: 'Ready for Odoo' },
];

export function PipelineVisual() {
  const pipelineSteps = useInvoiceStore((state) => state.pipelineSteps);

  const getStatusColor = (status: PipelineStatus) => {
    switch (status) {
      case 'active':
        return 'bg-status-progress text-white';
      case 'completed':
        return 'bg-status-success text-white';
      case 'error':
        return 'bg-status-error text-white';
      default:
        return 'bg-accent-hover text-secondary-text';
    }
  };

  const getStepOpacity = (status: PipelineStatus) => {
    return status === 'idle' ? 'opacity-50' : 'opacity-100';
  };

  return (
    <div className="bg-accent-surface rounded-xl p-8 shadow-sm">
      <div className="flex justify-between items-center">
        {steps.map((step, index) => {
          const stepData = pipelineSteps[step.id];
          const Icon = step.icon;

          return (
            <React.Fragment key={step.id}>
              <div className={cn('flex flex-col items-center flex-1', getStepOpacity(stepData.status))}>
                <div
                  className={cn(
                    'w-16 h-16 rounded-full flex items-center justify-center mb-3 transition-all duration-300',
                    getStatusColor(stepData.status),
                    stepData.status === 'active' && 'animate-pulse'
                  )}
                >
                  <Icon className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <div className="font-medium text-sm text-primary-text">{step.title}</div>
                  <div className="text-xs text-secondary-text mt-1">{stepData.message}</div>
                </div>
              </div>

              {index < steps.length - 1 && (
                <div className="flex-shrink-0 w-16 h-0.5 bg-gray-200 self-center mb-8">
                  <div
                    className={cn(
                      'h-full transition-all duration-500',
                      stepData.status === 'completed' ? 'bg-status-success w-full' : 'w-0'
                    )}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}