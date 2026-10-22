/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { display: ['Georgia', 'Cambria', 'Times New Roman', 'serif'] },
      colors: {
        forest: { 50: '#EEF5F0', 100: '#D6E8DB', 200: '#A9CDB3', 500: '#3F8A57', 600: '#2F7D4A', 700: '#25613A', 800: '#1F4D2E', 900: '#173A23' },
        maize: { 100: '#FBF0C8', 200: '#F5E19A', 400: '#EBC54A', 500: '#E5B72E', 600: '#C99A12', 700: '#8A6A0B' },
        cream: '#FAF6EC',
        charcoal: '#2B2B2B',
      },
    },
  },
  plugins: [],
};
