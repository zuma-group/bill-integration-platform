'use client';

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { validateFile } from '@/lib/utils';

interface DropzoneProps {
  onDrop: (files: File[]) => void;
  accept?: Record<string, string[]>;
  maxSize?: number;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Dropzone({
  onDrop,
  accept = {
    'application/pdf': ['.pdf'],
    'image/png': ['.png'],
    'image/jpeg': ['.jpg', '.jpeg'],
  },
  maxSize = 10 * 1024 * 1024, // 10MB
  multiple = false,
  disabled = false,
  className,
}: DropzoneProps) {
  const onDropAccepted = useCallback((acceptedFiles: File[]) => {
    const validFiles = acceptedFiles.filter(file => {
      const validation = validateFile(file);
      if (!validation.valid) {
        console.error(validation.error);
        return false;
      }
      return true;
    });

    if (validFiles.length > 0) {
      onDrop(validFiles);
    }
  }, [onDrop]);

  const { getRootProps, getInputProps, isDragActive, isDragReject, acceptedFiles } = useDropzone({
    onDrop: onDropAccepted,
    accept,
    maxSize,
    multiple,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        'relative rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-200',
        'hover:border-accent-action hover:bg-accent-hover/50',
        isDragActive && 'border-accent-action bg-accent-hover/50',
        isDragReject && 'border-status-error bg-red-50',
        disabled && 'opacity-50 cursor-not-allowed',
        !isDragActive && !isDragReject && 'border-gray-300',
        className
      )}
    >
      <input {...getInputProps()} />

      <div className="flex flex-col items-center space-y-4">
        {isDragReject ? (
          <>
            <X className="w-12 h-12 text-status-error" />
            <p className="text-status-error font-medium">
              File type not accepted or file too large
            </p>
          </>
        ) : isDragActive ? (
          <>
            <FileText className="w-12 h-12 text-accent-action animate-pulse" />
            <p className="text-accent-action font-medium">Drop the files here...</p>
          </>
        ) : (
          <>
            <Upload className="w-12 h-12 text-secondary-text" />
            <div>
              <p className="text-primary-text font-medium text-lg">
                Drop your invoice files here or click to browse
              </p>
              <p className="text-secondary-text text-sm mt-2">
                Supports PDF, PNG, JPG (Max 10MB) • Can process multiple invoices in one document
              </p>
            </div>
          </>
        )}
      </div>

      {acceptedFiles.length > 0 && (
        <div className="mt-6 space-y-2">
          <p className="text-sm text-secondary-text font-medium">Selected files:</p>
          {acceptedFiles.map((file, index) => (
            <div key={index} className="flex items-center justify-center space-x-2">
              <FileText className="w-4 h-4 text-accent-action" />
              <span className="text-sm text-primary-text">{file.name}</span>
              <span className="text-xs text-secondary-text">
                ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}