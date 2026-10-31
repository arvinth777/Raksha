/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Every colour resolves to a token in tokens.css (day by default, night under [data-theme="night"]).
      colors: {
        'paper': 'oklch(var(--c-paper) / <alpha-value>)',
        'paper-2': 'oklch(var(--c-paper-2) / <alpha-value>)',
        'paper-3': 'oklch(var(--c-paper-3) / <alpha-value>)',
        'card': 'oklch(var(--c-card) / <alpha-value>)',
        'ink': 'oklch(var(--c-ink) / <alpha-value>)',
        'ink-2': 'oklch(var(--c-ink-2) / <alpha-value>)',
        'ink-3': 'oklch(var(--c-ink-3) / <alpha-value>)',
        'rule': 'oklch(var(--c-rule) / <alpha-value>)',
        'accent': 'oklch(var(--c-accent) / <alpha-value>)',
        'accent-soft': 'oklch(var(--c-accent-soft) / <alpha-value>)',
        'accent-ink': 'oklch(var(--c-accent-ink) / <alpha-value>)',
        'danger': 'oklch(var(--c-danger) / <alpha-value>)',
        'danger-soft': 'oklch(var(--c-danger-soft) / <alpha-value>)',
        'danger-ink': 'oklch(var(--c-danger-ink) / <alpha-value>)',
        'warn': 'oklch(var(--c-warn) / <alpha-value>)',
        'warn-soft': 'oklch(var(--c-warn-soft) / <alpha-value>)',
        'safe': 'oklch(var(--c-safe) / <alpha-value>)',
        'focus': 'oklch(var(--c-focus) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-body)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        card: 'var(--radius-card)',
        input: 'var(--radius-input)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
      },
    },
  },
  plugins: [],
};

