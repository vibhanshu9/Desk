/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#6C63FF',
        dark: '#0f0f1a',
        surface: '#1a1a2e',
        card: '#16213e',
        border: '#0f3460',
      }
    }
  },
  plugins: []
}
