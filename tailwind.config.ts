import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary-bg': '#F9FAFB',
        'primary-text': '#111827',
        'secondary-text': '#6B7280',
        'status-success': '#10B981',
        'status-progress': '#3B82F6',
        'status-warning': '#F59E0B',
        'status-error': '#EF4444',
        'status-idle': '#9CA3AF',
        'accent-action': '#2563EB',
        'accent-highlight': '#8B5CF6',
        'accent-surface': '#FFFFFF',
        'accent-hover': '#F3F4F6',
      },
    },
  },
  plugins: [],
};

export default config;