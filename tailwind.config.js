/** @type {import('tailwindcss').Config} */
export default {
  content: [
    // Kita arahkan ke semua file .html dan .js di dalam folder Public
    // Agar Tailwind membaca semua kelas yang kamu gunakan di sana
    "./Public/**/*.{html,js,ts,jsx,tsx}",
    "./partials/**/*.{html,js}",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}