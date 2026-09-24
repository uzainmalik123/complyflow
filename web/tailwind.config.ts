import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#EDEAE1",
        ink: "#201D1A",
        "ledger-line": "#C9C2B3",
        brass: "#8C6D28",
        "stamp-green": "#3F6B4F",
        "stamp-red": "#A23E2E",
        "stamp-amber": "#B8862F",
      },
      fontFamily: {
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;