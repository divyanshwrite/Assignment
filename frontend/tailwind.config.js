/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#FF5E3A',
          hover: '#E04E2A',
          glow: 'rgba(255, 94, 58, 0.4)',
        },
        darkBtn: {
          DEFAULT: '#1E1E1E',
          hover: '#111111',
        },
        bgPage: '#CCCCCC',
        bgHover: '#F3F3F3',
        bgActive: '#ECECEC',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Outfit', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

