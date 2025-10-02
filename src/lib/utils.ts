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

/**
 * Normalize a date string to yyyy/mm/dd format for Odoo
 * Handles various input formats including:
 * - mm/dd/yyyy, dd/mm/yyyy, yyyy/mm/dd
 * - mm-dd-yyyy, dd-mm-yyyy, yyyy-mm-dd
 * - ISO date strings (yyyy-mm-ddTHH:mm:ss.sssZ)
 * - Locale-specific date formats
 * 
 * @param dateString - The date string in any common format
 * @returns Date in yyyy/mm/dd format, or original string if parsing fails
 */
export function normalizeToOdooDateFormat(dateString: string | null | undefined): string {
  if (!dateString) return '';
  
  // Trim whitespace
  const trimmed = dateString.trim();
  if (!trimmed) return '';
  
  try {
    let date: Date | null = null;
    
    // Try to parse common formats
    // Pattern 1: yyyy/mm/dd or yyyy-mm-dd (already in correct format, just validate)
    if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}/.test(trimmed)) {
      const parts = trimmed.split(/[/-]/);
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1; // JS months are 0-indexed
      const day = parseInt(parts[2]);
      date = new Date(year, month, day);
    }
    // Pattern 2: mm/dd/yyyy or mm-dd-yyyy (US format)
    else if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}/.test(trimmed)) {
      const parts = trimmed.split(/[/-]/);
      // Assume mm/dd/yyyy format (US format)
      const month = parseInt(parts[0]) - 1;
      const day = parseInt(parts[1]);
      const year = parseInt(parts[2]);
      date = new Date(year, month, day);
    }
    // Pattern 3: dd.mm.yyyy or dd/mm/yyyy (European format - but ambiguous with US)
    else if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(trimmed)) {
      const parts = trimmed.split('.');
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const year = parseInt(parts[2]);
      date = new Date(year, month, day);
    }
    // Pattern 4: ISO 8601 or other standard formats
    else {
      date = new Date(trimmed);
    }
    
    // Validate the date
    if (!date || isNaN(date.getTime())) {
      console.warn(`Unable to parse date: "${dateString}". Returning original value.`);
      return trimmed;
    }
    
    // Format as yyyy/mm/dd
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}/${month}/${day}`;
    
  } catch (error) {
    console.error(`Error normalizing date "${dateString}":`, error);
    return trimmed;
  }
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