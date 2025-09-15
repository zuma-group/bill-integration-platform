# Invoice OCR to Odoo Pipeline - Next.js 15

A modern web application for extracting invoice data using OCR (Google Gemini 2.0 Flash) and syncing with Odoo. Built with Next.js 15, TypeScript, and Tailwind CSS.

## Features

- **Real OCR Processing**: Uses Google Gemini 2.0 Flash API for actual text extraction
- **Multi-Invoice Support**: Automatically detects and processes multiple invoices in one document
- **Batch Processing**: Handle up to 20 invoices simultaneously
- **Smart Selection UI**: Choose which invoices to process from multi-invoice documents
- **Visual Pipeline**: Track processing progress through intuitive steps
- **Modern UI**: Clean, responsive design with semantic color system
- **Type Safety**: Full TypeScript implementation
- **Local Storage**: Data persistence (PostgreSQL ready for production)

## Tech Stack

- **Next.js 15** - Latest React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Beautiful icon library
- **Zustand** - State management
- **React Hook Form** - Form handling
- **React Dropzone** - File upload
- **Framer Motion** - Animations
- **Prisma** - Database ORM (prepared for PostgreSQL)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd bill-integration-platform
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
The `.env.local` file is already configured with the Gemini API key.

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   └── ocr/          # OCR processing endpoint
│   ├── invoices/         # Processed invoices page
│   ├── odoo/            # Odoo records page
│   └── page.tsx         # Home/Upload page
├── components/
│   ├── ui/              # Reusable UI components
│   ├── invoice/         # Invoice-specific components
│   ├── pipeline/        # Pipeline visualization
│   └── layout/          # Layout components
├── lib/                 # Utilities and API clients
├── store/              # Zustand state management
└── types/              # TypeScript type definitions
```

## Color Palette

The application uses a semantic color system:

- **Primary Background**: `#F9FAFB` - Light neutral gray
- **Primary Text**: `#111827` - Near black for readability
- **Secondary Text**: `#6B7280` - Cool gray for metadata

**Status Colors:**
- **Success**: `#10B981` - Emerald green
- **In Progress**: `#3B82F6` - Blue
- **Warning**: `#F59E0B` - Amber
- **Error**: `#EF4444` - Red
- **Idle**: `#9CA3AF` - Medium gray

**Accent Colors:**
- **Action Buttons**: `#2563EB` - Royal blue
- **Highlight**: `#8B5CF6` - Violet
- **Surface**: `#FFFFFF` - White
- **Surface Hover**: `#F3F4F6` - Soft gray

## Usage

### Upload & Process

1. **Upload Files**: Drag and drop or click to upload PDF/PNG/JPG files
2. **OCR Processing**: Automatic text extraction using Gemini API
3. **Multi-Invoice Detection**: If multiple invoices detected, selection UI appears
4. **Review Data**: Check extracted information before syncing
5. **Sync to Odoo**: Create vendor bills in Odoo (simulated)

### Manage Invoices

- View all processed invoices in the "Processed Invoices" tab
- Filter by status (extracted/synced)
- Batch sync multiple invoices
- Delete unwanted records

### Odoo Records

- View all synced vendor bills
- Track bill status and amounts
- Export data (coming soon)

## API Integration

### Gemini OCR

The application uses Google's Gemini 2.0 Flash API for OCR:

```typescript
// API endpoint: /api/ocr
// Method: POST
// Body: { base64: string, mimeType: string }
```

### Odoo Integration (Simulated)

Currently simulated in localStorage. For production:

1. Update `.env.local` with Odoo credentials
2. Implement real API calls in `/lib/odoo.ts`
3. Update sync functions in the store

## Database (TODO)

The application is prepared for PostgreSQL integration:

1. Set up PostgreSQL database
2. Update `DATABASE_URL` in `.env.local`
3. Run Prisma migrations:
```bash
npx prisma generate
npx prisma db push
```
4. Replace localStorage calls with Prisma client

## Development

### Available Scripts

```bash
npm run dev       # Start development server
npm run build     # Build for production
npm run start     # Start production server
npm run lint      # Run ESLint
npm run type-check # TypeScript type checking
```

### Adding New Features

1. Create components in `/src/components`
2. Add types to `/src/types`
3. Update store in `/src/store`
4. Follow the existing patterns for consistency

## Performance

- Optimized for large documents (up to 20 invoices)
- Lazy loading for better initial load
- React Server Components where applicable
- Efficient state management with Zustand

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Future Enhancements

- [ ] Real PostgreSQL integration
- [ ] Real Odoo API integration
- [ ] User authentication
- [ ] Export to CSV/Excel
- [ ] Advanced search and filtering
- [ ] Audit trail
- [ ] Email notifications
- [ ] Webhook support
- [ ] Dark mode

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - feel free to use for your projects

## Support

For issues or questions, please open an issue in the repository.
