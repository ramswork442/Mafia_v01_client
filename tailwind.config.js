/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
      './pages/**/*.{html,js}',
      './components/**/*.{html,js}',
    ],
    theme: {
      extend: {
        colors: {
          'night-bg': '#1a1a2e',
          'night-accent': '#16213e',
          'day-bg': '#f0e7db',
          'day-accent': '#d4a373',
          'mafia-red': '#b91c1c',
          'villager-green': '#15803d',
        },
      },
    },
    plugins: [],
  }
  
  