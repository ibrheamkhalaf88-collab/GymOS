// Shared Tailwind config — loaded after vendor/tailwind.js on every page
// Design system: "Digital Pulse — Cyber Athletic" (see docs/design/digital_pulse_cyber_athletic/DESIGN.md)
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#000000",
        surface: "#171717",
        "surface-hover": "#262626",
        "surface-container": "#1a1a1a",
        "surface-container-high": "#202020",
        "surface-container-highest": "#262626",
        primary: "#ccff00",
        "primary-fixed": "#c3f400",
        "primary-dim": "#abd600",
        "on-primary": "#161e00",
        alert: "#ff3366",
        accent: "#ff3366",
        error: "#ffb4ab",
        tertiary: "#ffffff",
        frost: "#9bafbc",
        "frost-fixed": "#d1e5f3",
        "frost-fixed-dim": "#b5c9d7",
        muted: "#8f8f8f",
        "text-main": "#f5f5f5",
        "on-surface": "#e2e4cf",
        "on-surface-variant": "#b3b3b3",
        "surface-variant": "#262626",
        outline: "#555555",
        "outline-variant": "#333333",
      },
      fontFamily: {
        display: ["Space Grotesk", "Tajawal", "sans-serif"],
        headline: ["Space Grotesk", "Tajawal", "sans-serif"],
        body: ["Manrope", "Tajawal", "sans-serif"],
        label: ["Space Grotesk", "Tajawal", "sans-serif"],
        arabic: ["Tajawal", "sans-serif"],
      },
      boxShadow: {
        neon: "0 0 12px rgba(204,255,0,0.4)",
        "neon-lg": "0 0 20px rgba(204,255,0,0.5)",
        "neon-alert": "0 0 12px rgba(255,51,102,0.4)",
      },
      borderRadius: { DEFAULT: "1rem", lg: "2rem", xl: "3rem", full: "9999px" },
    },
  },
};