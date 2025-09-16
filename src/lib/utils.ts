import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (!result) {
        reject(new Error('Failed to read file - result is empty'));
        return;
      }
      const base64Parts = result.split(',');
      if (base64Parts.length !== 2) {
        reject(new Error('Invalid base64 format - expected data URL'));
        return;
      }
      resolve(base64Parts[1]);
    };
    reader.onerror = () => {
      reject(new Error(`Failed to read file: ${reader.error?.message || 'Unknown error'}`));
    };
    reader.readAsDataURL(file);
  });
}

export function getMimeType(file: File): string {
  return file.type || 'application/octet-stream';
}

export function validateFile(file: File): { valid: boolean; error?: string } {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];

  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 10MB limit' };
  }

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Invalid file type. Please upload PDF, PNG, or JPG files.' };
  }

  return { valid: true };
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function getStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    extracted: 'status-warning',
    synced: 'status-success',
    processing: 'status-progress',
    error: 'status-error',
    idle: 'status-idle',
  };

  return statusColors[status] || 'status-idle';
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}