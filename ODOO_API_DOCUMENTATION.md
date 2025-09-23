# BIP to Odoo Integration API Documentation

## Overview
This document describes the push-based API integration between BIP (Bill Integration Platform) and Odoo for invoice data transfer.

**UPDATE**: The payload format has been updated to match Odoo's exact bill creation API structure as provided by Asfand.

## Architecture
- **Type**: Push-based (BIP pushes to Odoo webhook)
- **Method**: POST
- **Format**: JSON
- **Authentication**: API Key (X-API-Key header)

## Endpoint

### Push Invoice Data to Odoo
```
POST https://your-bip-instance.vercel.app/api/push-to-odoo
```

This endpoint processes extracted invoices and forwards them to Odoo's webhook.

## Request Format

### Headers
```json
{
  "Content-Type": "application/json"
}
```

### Request Body
```json
{
  "invoices": [...],           // Array of extracted invoice objects
  "originalPdfBase64": "..."   // Base64 encoded original PDF
}
```

## Response Format

### Success Response (200)
```json
{
  "success": true,
  "taskId": "TASK-1705592400000-k3j4h5g6",
  "message": "Data sent to Odoo",
  "invoiceCount": 3,
  "payload": {...}  // The formatted payload sent to Odoo
}
```

### Error Response (400/500)
```json
{
  "error": "Error message",
  "details": {...}  // Additional error details in development
}
```

## Odoo Webhook Payload Structure (UPDATED)

When BIP pushes data to Odoo, it sends the following exact structure matching Odoo's bill creation API:

```json
{
  "invoices": [
    {
      "Invoice-No": "601950",
      "Invoice-Date": "9/18/25",
      "Customer PO Number": "PU41637-OP",
      "Customer": "JLG Industries, Inc.\n1 JLG Drive\nMcConnellsburg, PA 17233",
      "Customer No": "",
      "Payment Terms": "NET 30 DAYS",
      "Subtotal": "144.50",
      "Tax Amount": "0.00",
      "Total Amount": "144.50",
      "invoice-or-credit": "INVOICE",

      "Carrier": "",
      "Date Shipped": "",
      "Sales Order No": "",
      "Incoterms": "",
      "Freight": "",

      "lines": [
        {
          "product_code": "CS-FD380-GD3",
          "description": "FD380-GD3-COCA FOLD",
          "quantity": 9,
          "unit_price": 3670.56,
          "discount": 0,
          "taxes": [],
          "subtotal": 33035.04
        }
      ],

      "attachments": [
        {
          "filename": "INV601950.pdf",
          "url": "/api/attachments/INV601950.pdf"
        }
      ]
    }
  ]
}
```

## Field Mappings

### BIP Fields → Odoo Fields
- `invoiceNumber` → `"Invoice-No"`
- `invoiceDate` → `"Invoice-Date"`
- `customerPoNumber` → `"Customer PO Number"`
- `customer.name + address` → `"Customer"`
- `paymentTerms` → `"Payment Terms"`
- `subtotal` → `"Subtotal"` (as string)
- `taxAmount` → `"Tax Amount"` (as string)
- `total` → `"Total Amount"` (as string)

### Line Items Mapping
- `lineItems.partNumber` → `lines.product_code`
- `lineItems.description` → `lines.description`
- `lineItems.quantity` → `lines.quantity`
- `lineItems.unitPrice` → `lines.unit_price`
- `lineItems.amount` → `lines.subtotal`

### PDF Handling
- PDFs are stored temporarily on BIP server
- Accessible via URL: `/api/attachments/{filename}`
- Single invoice: Original PDF with generated filename
- Multiple invoices: PDF is split, each invoice gets individual PDF
- URLs are provided in `attachments` array, not base64

## Integration Workflow

1. **User uploads document** to BIP
2. **BIP extracts invoice data** using OCR
3. **User reviews** extracted data
4. **User clicks "Push to Odoo"**
5. **BIP processes**:
   - Generates unique taskId
   - Splits PDF if multiple invoices
   - Formats data to match Odoo structure
6. **BIP sends POST** to Odoo webhook
7. **Odoo receives and processes** the data

## Setup Requirements

### For BIP Administrator
Add to `.env.local`:
```
ODOO_WEBHOOK_URL=https://staging.zuma.odolution.com/api/create_invoices
ODOO_API_KEY=your-api-key-here
NEXT_PUBLIC_BASE_URL=https://your-bip-instance.vercel.app
```

### For Odoo Developer
1. Webhook endpoint is: `https://staging.zuma.odolution.com/api/create_invoices`
2. Expect exact field names as shown (capitalized)
3. Product matching via `product_code` field
4. PDF attachments provided as URLs (fetch from BIP server)
5. All numeric totals are provided as strings

## Testing

### Test with cURL
```bash
curl -X POST https://your-bip.vercel.app/api/push-to-odoo \
  -H "Content-Type: application/json" \
  -d '{
    "invoices": [...],
    "originalPdfBase64": "..."
  }'
```

### Test Response
```bash
curl -X GET "https://your-bip.vercel.app/api/push-to-odoo?taskId=TASK-123"
```

Returns information about the push-based integration.

## Error Handling

### Common Error Codes
- `400` - Bad Request (missing required fields)
- `404` - Task not found (for GET requests)
- `500` - Internal server error

### Webhook Failures
If Odoo webhook fails:
- BIP logs the error but doesn't fail the request
- Invoice is still marked as processed in BIP
- Manual retry may be needed

## Important Notes

1. **No Database Storage**: BIP uses localStorage and server memory (no persistent DB)
2. **Serverless Architecture**: Runs on Vercel's serverless functions
3. **Push-Only**: Odoo cannot pull data from BIP (no persistent storage)
4. **PDF Splitting**: Automatic for multi-invoice documents
5. **Field Validation**: Ensure vendor_name and MPN match Odoo records

## Support

For issues or questions:
- BIP Issues: Contact development team
- Odoo Integration: Check webhook logs and field mappings
- API Key Issues: Verify environment variables

## Example Integration Code (Odoo Side)

```python
# Example Odoo webhook receiver for new format
@http.route('/api/create_invoices', type='json', auth='api_key', methods=['POST'])
def create_invoices(self, **kw):
    data = request.jsonrequest

    for invoice_data in data.get('invoices', []):
        # Parse customer info to extract vendor details
        # Note: Customer field contains vendor info in this context

        # Create invoice lines
        invoice_lines = []
        for line in invoice_data.get('lines', []):
            product = request.env['product.product'].search([
                ('default_code', '=', line['product_code'])
            ], limit=1)

            invoice_lines.append({
                'product_id': product.id if product else False,
                'name': line['description'],
                'quantity': line['quantity'],
                'price_unit': line['unit_price'],
                'discount': line.get('discount', 0),
                'price_subtotal': line['subtotal'],
            })

        # Create bill
        invoice = request.env['account.move'].create({
            'move_type': 'in_invoice',
            'invoice_date': invoice_data['Invoice-Date'],
            'ref': invoice_data['Invoice-No'],
            'narration': f"Customer PO: {invoice_data['Customer PO Number']}",
            'invoice_line_ids': [(0, 0, line) for line in invoice_lines],
        })

        # Fetch and attach PDFs
        for attachment in invoice_data.get('attachments', []):
            # Fetch PDF from BIP server
            pdf_response = requests.get(
                f"https://bip-instance.vercel.app{attachment['url']}"
            )
            if pdf_response.status_code == 200:
                request.env['ir.attachment'].create({
                    'name': attachment['filename'],
                    'type': 'binary',
                    'datas': base64.b64encode(pdf_response.content).decode(),
                    'res_model': 'account.move',
                    'res_id': invoice.id,
                })

    return {'success': True, 'message': f"Created {len(data.get('invoices', []))} invoices"}
```