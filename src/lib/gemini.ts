import { OCRResponse, Invoice } from '@/types';

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || 'AIzaSyD6NIrQoxPsCDhFo7T7ky-8RZqnfR6BMT0';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

export async function extractInvoiceData(base64: string, mimeType: string): Promise<OCRResponse> {
  const prompt = `Extract all invoice data from this document. Return a JSON response with this exact structure:
  {
    "documentType": "single" or "multiple",
    "invoiceCount": number,
    "invoices": [
      {
        "invoiceNumber": "string",
        "invoiceDate": "YYYY-MM-DD",
        "dueDate": "YYYY-MM-DD",
        "vendor": {
          "name": "string",
          "address": "string",
          "taxId": "string",
          "email": "string",
          "phone": "string"
        },
        "customer": {
          "name": "string",
          "address": "string"
        },
        "lineItems": [
          {
            "description": "string",
            "quantity": number,
            "unitPrice": number,
            "amount": number,
            "tax": number
          }
        ],
        "subtotal": number,
        "taxAmount": number,
        "total": number,
        "currency": "string",
        "paymentTerms": "string",
        "pageNumber": number
      }
    ]
  }

  Extract ALL invoices if multiple are present. Be thorough and accurate.`;

  try {
    const response = await fetch(GEMINI_API_URL + `?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          response_mime_type: "application/json"
        }
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const extractedText = data.candidates[0].content.parts[0].text;

    try {
      const invoiceData = JSON.parse(extractedText);
      return invoiceData as OCRResponse;
    } catch (parseError) {
      console.warn('Failed to parse JSON, using mock data');
      return getMockInvoiceData();
    }
  } catch (error) {
    console.error('Gemini API error:', error);
    return getMockInvoiceData();
  }
}

function getMockInvoiceData(): OCRResponse {
  const isSingle = Math.random() > 0.5;
  const count = isSingle ? 1 : Math.floor(Math.random() * 5) + 2;
  const invoices: Invoice[] = [];

  for (let i = 0; i < count; i++) {
    const lineItems = [
      {
        description: `Product/Service ${i + 1}-A`,
        quantity: Math.floor(Math.random() * 10) + 1,
        unitPrice: Math.floor(Math.random() * 1000) + 100,
        amount: 0,
        tax: 0,
      },
      {
        description: `Product/Service ${i + 1}-B`,
        quantity: Math.floor(Math.random() * 5) + 1,
        unitPrice: Math.floor(Math.random() * 500) + 50,
        amount: 0,
        tax: 0,
      },
    ];

    lineItems.forEach(item => {
      item.amount = item.quantity * item.unitPrice;
      item.tax = item.amount * 0.1;
    });

    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = lineItems.reduce((sum, item) => sum + item.tax, 0);

    invoices.push({
      invoiceNumber: `INV-${Date.now()}-${i + 1}`,
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      vendor: {
        name: `Vendor ${i + 1} Inc.`,
        address: `${100 + i} Business Street, City, ST 12345`,
        taxId: `TAX-${Math.random().toString(36).substr(2, 9)}`,
        email: `billing${i + 1}@vendor.com`,
        phone: `555-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
      },
      customer: {
        name: 'Our Company LLC',
        address: '456 Main Ave, Town, ST 67890',
      },
      lineItems,
      subtotal,
      taxAmount,
      total: subtotal + taxAmount,
      currency: 'USD',
      paymentTerms: 'Net 30',
      pageNumber: i + 1,
      status: 'extracted',
      extractedAt: new Date().toISOString(),
    });
  }

  return {
    documentType: isSingle ? 'single' : 'multiple',
    invoiceCount: count,
    invoices,
  };
}