import { OCRResponse } from '@/types';
import { generateTaskId } from '@/lib/pdf-splitter';

// Attempts to repair truncated JSON by closing open structures
function attemptJsonRepair(truncatedJson: string): string {
  let repaired = truncatedJson.trim();

  // Count open brackets and braces
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !inString) {
      inString = true;
    } else if (char === '"' && inString) {
      inString = false;
    }

    if (!inString) {
      if (char === '{') openBraces++;
      if (char === '}') openBraces--;
      if (char === '[') openBrackets++;
      if (char === ']') openBrackets--;
    }
  }

  // If we're in a string, close it
  if (inString) {
    repaired += '"';
  }

  // Remove any trailing comma
  repaired = repaired.replace(/,\s*$/, '');

  // Close any incomplete objects in the invoices array
  if (repaired.includes('"invoices":') && !repaired.includes('"invoices": []')) {
    // If the last character isn't a closing bracket/brace, we need to close structures
    const lastChar = repaired[repaired.length - 1];
    if (lastChar !== '}' && lastChar !== ']') {
      // Close any open line items
      if (repaired.includes('"lineItems":') && openBrackets > 0) {
        repaired += ']';
        openBrackets--;
      }

      // Add missing fields with defaults if we're mid-invoice
      if (openBraces > 0 && repaired.includes('"invoiceNumber":')) {
        // Add closing for current invoice object
        repaired += '}';
        openBraces--;
      }
    }
  }

  // Close remaining structures
  while (openBrackets > 0) {
    repaired += ']';
    openBrackets--;
  }

  while (openBraces > 0) {
    repaired += '}';
    openBraces--;
  }

  return repaired;
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export async function extractInvoiceData(base64: string, mimeType: string): Promise<OCRResponse> {
  const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured! Please set NEXT_PUBLIC_GEMINI_API_KEY in your environment variables');
  }

  const prompt = `Extract invoice data from this document.

  Extract ALL invoices found in the document, regardless of count.

  CRITICAL EXTRACTION RULES:
  1. Customer PO Number vs Line Item PO: These are DIFFERENT. The customer PO is in the invoice header (often in a table with Account #, PST #, Order #, Clerk, etc.). Line items may have their own "Purchase Order" which is NOT the customer PO.
  2. For multi-page invoices: Track ALL page numbers where each invoice appears (e.g., if invoice spans pages 1-3, include [1,2,3])

  IMPORTANT: Pay special attention to:
  - Customer PO Number: This is typically found in the invoice header/details section (NOT in line items). Look for labels like: PO Number, Purchase Order, Customer PO, Reference Number, Order #, Order Number, Order No, Ord #, Ord No, or just "Order". In the header information table, if you see "Order #" with a value, that's the customer PO number.
  - Part Numbers for each line item (also called Item Number, SKU, Product Code, Part #, Item Code, or Item #)
  - Page numbers: Track which pages each invoice appears on

  Return a JSON response with this EXACT structure:
  {
    "documentType": "single" or "multiple",
    "invoiceCount": number (total count found),
    "invoices": [
      {
        "invoiceNumber": "string",
        "customerPoNumber": "string" or null (Extract from HEADER section - Look for: Order #, PO Number, Purchase Order, Customer PO, Reference Number, Order Number, etc. DO NOT confuse with line item purchase orders),
        "invoiceDate": "string (KEEP the EXACT date format as shown on the invoice - do NOT convert)",
        "dueDate": "string" or null (KEEP the EXACT date format as shown on the invoice - do NOT convert),
        "vendor": {
          "name": "string",
          "address": "string",
          "taxId": "string" or null,
          "email": "string" or null,
          "phone": "string" or null
        },
        "customer": {
          "name": "string",
          "address": "string"
        },
        "lineItems": [
          {
            "description": "string",
            "partNumber": "string" or null (LOOK FOR: Part Number, Item Number, SKU, Product Code, Part #, Item #),
            "quantity": number,
            "unitPrice": number,
            "amount": number,
            "tax": number
          }
        ],
        "subtotal": number,
        "taxAmount": number,
        "taxType": "string" or null (Extract tax type - look for: GST, PST, GST 5%, PST 7%, etc. Return exact text as shown on invoice),
        "total": number,
        "currency": "string",
        "paymentTerms": "string" or null,
        "pageNumber": number (first page where invoice starts),
        "pageNumbers": [array of all page numbers this invoice spans] or null
      }
    ]
  }

  For fields that are not present, use null. Extract ALL invoices found in the document.`;

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
          response_mime_type: "application/json"
        }
      })
    });

    if (!response.ok) {
      let errorMessage = `API request failed with status ${response.status}`;

      // Add specific error messages for common status codes
      switch (response.status) {
        case 400:
          errorMessage = 'Bad Request: Invalid request format or parameters';
          break;
        case 401:
          errorMessage = 'Unauthorized: Invalid API key. Please check your NEXT_PUBLIC_GEMINI_API_KEY';
          break;
        case 403:
          errorMessage = 'Forbidden: API key lacks required permissions';
          break;
        case 429:
          errorMessage = 'Rate Limit Exceeded: Too many requests. Please wait and try again';
          break;
        case 500:
          errorMessage = 'Gemini API Internal Server Error: Service is having issues';
          break;
        case 503:
          errorMessage = 'Service Unavailable: Gemini API is temporarily down or overloaded. Please try again in a few moments';
          break;
      }

      // Try to get more details from response body
      try {
        const errorData = await response.json();
        if (errorData.error?.message) {
          errorMessage += `: ${errorData.error.message}`;
        }
      } catch {
        // If we can't parse error response, use the default message
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();

    // Check if we have a valid response structure
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('Invalid response structure from Gemini API');
    }

    const extractedText = data.candidates[0].content.parts[0].text;

    try {
      const invoiceData = JSON.parse(extractedText);

      // Validate required fields
      if (!invoiceData.documentType || !Array.isArray(invoiceData.invoices)) {
        throw new Error('Response missing required fields (documentType or invoices array)');
      }

      // Log the number of invoices extracted
      console.log(`Successfully extracted ${invoiceData.invoices.length} invoices from document`);

      // Add a taskId to track this extraction
      const taskId = generateTaskId();

      return {
        ...invoiceData,
        taskId
      } as OCRResponse;
    } catch {
      // Try to repair truncated JSON
      console.error('JSON parse failed, attempting repair...');

      try {
        const repaired = attemptJsonRepair(extractedText);
        const invoiceData = JSON.parse(repaired);

        console.warn('Successfully repaired truncated JSON response');
        return invoiceData as OCRResponse;
      } catch {
        throw new Error(
          `Failed to parse Gemini response. The response appears to be truncated or invalid JSON. ` +
          `This often happens with documents containing too many invoices (found ${extractedText.includes('"invoiceCount":') ?
            extractedText.match(/"invoiceCount":\s*(\d+)/)?.[1] : 'unknown'} invoices). ` +
          `Try processing fewer invoices at once.`
        );
      }
    }
  } catch (error) {
    throw new Error(`Gemini API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}