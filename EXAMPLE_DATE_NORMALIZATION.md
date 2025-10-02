# Date Normalization Example

## Scenario: Invoice with Different Date Formats

### Input: Invoice Extracted from Document

```json
{
  "invoiceNumber": "INV-2024-001",
  "invoiceDate": "12/31/2024",
  "dueDate": "01/30/2025",
  "vendor": {
    "name": "ACME Corp"
  },
  "total": 1500.00
}
```

### Before Fix (Sent to Odoo)

```json
{
  "invoices": [{
    "invoiceNumber": "INV-2024-001",
    "invoiceDate": "12/31/2024",  // ❌ Format depends on extraction
    "dueDate": "01/30/2025",      // ❌ Format depends on extraction
    "vendor": {
      "name": "ACME Corp"
    },
    "total": 1500.00
  }]
}
```

**Problem**: The date format varies based on how it was extracted from the document. Could be:
- `12/31/2024` (US format)
- `31/12/2024` (European format)
- `31.12.2024` (European with dots)
- `2024-12-31` (ISO format)

### After Fix (Sent to Odoo)

```json
{
  "invoices": [{
    "invoiceNumber": "INV-2024-001",
    "invoiceDate": "2024/12/31",  // ✅ Always yyyy/mm/dd
    "dueDate": "2025/01/30",      // ✅ Always yyyy/mm/dd
    "vendor": {
      "name": "ACME Corp"
    },
    "total": 1500.00
  }]
}
```

**Solution**: All dates are normalized to `yyyy/mm/dd` format before sending to Odoo.

## More Examples

### Example 1: European Format
**Input**: `31.12.2024`  
**Output**: `2024/12/31` ✅

### Example 2: ISO Format
**Input**: `2024-12-31`  
**Output**: `2024/12/31` ✅

### Example 3: US Format with Single Digits
**Input**: `1/5/2024`  
**Output**: `2024/01/05` ✅

### Example 4: ISO Timestamp
**Input**: `2024-12-31T23:59:59.000Z`  
**Output**: `2024/12/31` ✅

### Example 5: Already Correct Format
**Input**: `2024/12/31`  
**Output**: `2024/12/31` ✅

## Code Flow

```
Document Upload
       ↓
OCR Extraction (Gemini)
       ↓
Invoice Data (dates in original format)
       ↓
User Reviews & Confirms
       ↓
Push to Odoo (API endpoint)
       ↓
🔄 Date Normalization Applied Here
       ↓
Payload Sent to Odoo (dates in yyyy/mm/dd)
```

## Implementation Details

The normalization happens in `/api/push-to-odoo` route:

```typescript
// Before sending to Odoo
return {
  invoiceNumber: rawInvoiceNumber,
  invoiceDate: normalizeToOdooDateFormat(invoice.invoiceDate),  // 🔄 Normalized
  dueDate: normalizeToOdooDateFormat(invoice.dueDate),          // 🔄 Normalized
  // ... rest of the payload
};
```

## Benefits

1. **Predictable Format**: Odoo always receives dates in the same format
2. **No Parsing Ambiguity**: No confusion between US (mm/dd/yyyy) vs European (dd/mm/yyyy) formats
3. **Backwards Compatible**: Dates already in correct format pass through unchanged
4. **Graceful Handling**: If normalization fails, original value is preserved
5. **Zero Impact on UI**: Users still see dates in extracted format during review
