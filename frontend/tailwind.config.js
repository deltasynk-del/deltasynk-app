/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        // DeltaSynk brand (matches the marketing site).
        brand: {
          50: '#effafb',
          100: '#d6f1f4',
          500: '#0f7a8a',
          600: '#0f7a8a',
          700: '#0b5f6c',
          800: '#0A2540',
          accent: '#22c1c3',
        },
      },
    },
  },
  plugins: [],
};
