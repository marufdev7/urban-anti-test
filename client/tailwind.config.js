/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Design tokens tuned against the reference screenshots (FRONTEND_PLAN §6).
        surface: {
          DEFAULT: '#eef2f7', // very light blue-gray page background
          panel: '#ffffff', // white content panels
          sunken: '#f6f8fb', // inset areas (filter bars, table zebra)
        },
        ink: {
          DEFAULT: '#16212e', // dark navy main text
          muted: '#4e5f73',
          faint: '#617389',
        },
        primary: {
          DEFAULT: '#0e7c6d', // teal accent (CTA, active nav, links)
          hover: '#0b6a5d',
          soft: '#e3f2ef', // tinted backgrounds (active nav item)
          ring: 'rgba(14, 124, 109, 0.35)',
        },
        line: '#dde4ec', // cool gray-blue 1px borders
        status: {
          critical: '#dc2626',
          'critical-soft': '#fef2f2',
          high: '#ea580c',
          'high-soft': '#fff3ec',
          medium: '#d97706',
          'medium-soft': '#fffaeb',
          low: '#16a34a',
          'low-soft': '#f0fdf4',
          processing: '#64748b',
          'processing-soft': '#f1f5f9',
          resolved: '#16a34a',
          'resolved-soft': '#f0fdf4',
        },
        danger: {
          DEFAULT: '#dc2626',
          hover: '#b91c1c',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      borderRadius: {
        panel: '0.5rem',
      },
      boxShadow: {
        panel: '0 1px 2px rgba(16, 33, 51, 0.06)',
        menu: '0 8px 24px rgba(16, 33, 51, 0.14)',
      },
      keyframes: {
        dropdown: {
          '0%': { opacity: '0', transform: 'scale(0.95) translateY(-6px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        dropdown: 'dropdown 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
    },
  },
  plugins: [],
}
