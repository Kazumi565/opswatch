import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#0d1117",
        panel: "#131a23",
        accent: "#2ad0a9",
        warn: "#f4c95d",
        danger: "#ff6b6b",
      },
      boxShadow: {
        panel: "0 12px 30px rgba(0, 0, 0, 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
