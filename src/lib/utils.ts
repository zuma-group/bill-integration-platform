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
 * Normalizes a date string to yyyy/mm/dd format for Odoo payload
 * Handles various input formats including:
 * - ISO format (yyyy-mm-dd, yyyy/mm/dd)
 * - US format (mm/dd/yyyy, mm-dd-yyyy)
 * - European format (dd/mm/yyyy, dd-mm-yyyy)
 * - Long format (January 1, 2024)
 * 
 * @param dateString - Date string in any common format
 * @returns Date in yyyy/mm/dd format, or empty string if invalid
 */
export function normalizeToOdooDateFormat(dateString: string | null | undefined): string {
  if (!dateString || dateString.trim() === '') {
    return '';
  }

  try {
    // Remove extra whitespace
    const cleaned = dateString.trim();
    
    // Try to parse the date
    let parsedDate: Date | null = null;
    
    // Handle various formats
    // Format: yyyy-mm-dd or yyyy/mm/dd
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(cleaned)) {
      parsedDate = new Date(cleaned);
    }
    // Format: mm/dd/yyyy, mm-dd-yyyy, or dd/mm/yyyy, dd-mm-yyyy
    else if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(cleaned)) {
      const parts = cleaned.split(/[-/]/);
      const first = parseInt(parts[0]);
      const second = parseInt(parts[1]);
      const year = parseInt(parts[2]);
      
      // If first part > 12, it must be day (European format: dd/mm/yyyy)
      if (first > 12) {
        parsedDate = new Date(year, second - 1, first);
      }
      // If second part > 12, first must be month (US format: mm/dd/yyyy)
      else if (second > 12) {
        parsedDate = new Date(year, first - 1, second);
      }
      // Otherwise, try parsing as US format (mm/dd/yyyy)
      else {
        parsedDate = new Date(cleaned);
      }
    }
    // Try parsing any other format (e.g., "January 1, 2024", "1 Jan 2024", etc.)
    else {
      parsedDate = new Date(cleaned);
    }
    
    // Validate the parsed date
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      console.warn(`Failed to parse date: ${dateString}`);
      return '';
    }
    
    // Format as yyyy/mm/dd
    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const day = String(parsedDate.getDate()).padStart(2, '0');
    
    return `${year}/${month}/${day}`;
  } catch (error) {
    console.error(`Error normalizing date "${dateString}":`, error);
    return '';
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

/**
 * Determines company ID based on PO number prefix (Skyjack bills)
 * PC prefix = Company 2 (Zuma Sales LLC)
 * PU prefix = Company 1 (Zuma Lift Service)
 * 
 * @param poNumber - Customer PO number
 * @returns Company ID (1 or 2)
 */
export function determineCompanyId(poNumber: string | undefined): number {
  if (!poNumber) return 1; // default to company 1
  const upperPo = poNumber.toUpperCase();
  if (upperPo.includes('PC')) return 2;
  if (upperPo.includes('PU')) return 1;
  return 1; // default fallback
}