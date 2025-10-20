/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
      },
      textColor: {
        foreground: "hsl(var(--foreground))",
      },
      backgroundColor: {
        background: "hsl(var(--background))",
      },
    },
  },
  plugins: [],
};
