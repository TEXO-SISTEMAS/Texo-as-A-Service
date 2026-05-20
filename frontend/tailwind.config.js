/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        base:    'var(--bg-base)',
        surface: 'var(--bg-surface)',
        panel:   'var(--bg-panel)',
        border:  'var(--border)',
        // Colores institucionales
        teal: {
          DEFAULT: 'var(--teal)',
          dark: 'var(--teal-dark)',
          light: 'var(--teal-light)',
        },
        gold: 'var(--gold)',
        coral: 'var(--coral)',
        green: 'var(--green)',
        purple: 'var(--purple)',
        // Estados
        success: '#22c55e',
        warning: '#eab308',
        danger:  '#ef4444',
        // Acento (azul para acciones principales)
        accent: '#3b82f6',
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        xs: 'var(--text-xs)',
        sm: 'var(--text-sm)',
        base: 'var(--text-base)',
        lg: 'var(--text-lg)',
        xl: 'var(--text-xl)',
        '2xl': 'var(--text-2xl)',
        '3xl': 'var(--text-3xl)',
      },
    },
  },
  plugins: [],
};
