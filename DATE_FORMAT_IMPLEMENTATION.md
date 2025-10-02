# Date Format Standardization for Odoo Integration

## Issue: ZUM-255
**Title:** Maintain consistent date format in payload

## Problem
When the payload is sent to Odoo, dates could be in various formats depending on how they were extracted from the document (e.g., `mm/dd/yyyy`, `dd/mm/yyyy`, `dd.mm.yyyy`, ISO format, etc.). This inconsistency could cause issues with Odoo's date parsing.

## Solution
Implemented a date normalization function that converts any common date format to the standardized `yyyy/mm/dd` format before sending to Odoo.

## Changes Made

### 1. Added Date Normalization Function (`src/lib/utils.ts`)

Created `normalizeToOdooDateFormat()` function that:
- Accepts dates in multiple formats:
  - `mm/dd/yyyy` or `mm-dd-yyyy` (US format)
  - `dd.mm.yyyy` (European format with dots)
  - `yyyy/mm/dd` or `yyyy-mm-dd` (ISO format)
  - ISO 8601 full timestamps (`yyyy-mm-ddTHH:mm:ss.sssZ`)
- Handles edge cases:
  - Null/undefined values
  - Empty strings
  - Whitespace trimming
  - Single-digit days/months (ensures leading zeros)
- Returns normalized date in `yyyy/mm/dd` format
- Gracefully falls back to original value if parsing fails

### 2. Updated Odoo Payload Generation (`src/app/api/push-to-odoo/route.ts`)

Modified the invoice transformation to normalize dates before sending:
```typescript
// Before
invoiceDate: invoice.invoiceDate,
dueDate: invoice.dueDate,

// After
invoiceDate: normalizeToOdooDateFormat(invoice.invoiceDate),
dueDate: normalizeToOdooDateFormat(invoice.dueDate),
```

## Testing

Created comprehensive test suite covering 17 test cases:
- ✅ US format with slashes (`12/31/2024` → `2024/12/31`)
- ✅ US format with dashes (`12-31-2024` → `2024/12/31`)
- ✅ ISO format (`2024-12-31` → `2024/12/31`)
- ✅ European format with dots (`31.12.2024` → `2024/12/31`)
- ✅ ISO 8601 timestamps (`2024-12-31T23:59:59.000Z` → `2024/12/31`)
- ✅ Edge cases (null, undefined, empty, whitespace)
- ✅ Dates with/without leading zeros

All tests passed successfully.

## Impact

- **OCR Layer**: No changes. Dates are still extracted in their original format from documents
- **Odoo Integration**: All dates sent to Odoo are now consistently formatted as `yyyy/mm/dd`
- **UI Display**: No changes. The UI continues to display dates as extracted
- **Backwards Compatibility**: Function handles dates already in correct format

## Example Transformations

| Input Format | Example Input | Output Format |
|-------------|---------------|---------------|
| US Format | `12/31/2024` | `2024/12/31` |
| US with dashes | `01-15-2024` | `2024/01/15` |
| European | `31.12.2024` | `2024/12/31` |
| ISO | `2024-01-15` | `2024/01/15` |
| ISO Timestamp | `2024-12-31T23:59:59.000Z` | `2024/12/31` |

## Benefits

1. **Consistency**: Odoo always receives dates in a predictable format
2. **Reliability**: Reduces potential parsing errors on Odoo side
3. **Flexibility**: Supports documents with various date formats
4. **Robustness**: Graceful error handling prevents breaking the integration
5. **Maintainability**: Centralized date formatting logic

## Files Modified

- `src/lib/utils.ts` - Added `normalizeToOdooDateFormat()` function
- `src/app/api/push-to-odoo/route.ts` - Applied normalization to `invoiceDate` and `dueDate`

## Build Status

✅ TypeScript compilation successful
✅ Next.js build successful
✅ All tests passed
