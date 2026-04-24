import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{vue,js,ts}",
    "./components/**/*.{vue,js,ts}",
    "./pages/**/*.{vue,js,ts}",
    "./layouts/**/*.{vue,js,ts}",
    "./app.vue",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0b0f19",
        surface: "#121826",
        surface2: "#1a2234",
        border: "#24304a",
        text: "#e6ecf5",
        mute: "#8b97ad",
        accent: "#6ea8ff",
        good: "#4ade80",
        warn: "#facc15",
        bad: "#f87171",
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
      },
    },
  },
} satisfies Config;
