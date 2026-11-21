const { themeColors } = require("./theme.config");
const plugin = require("tailwindcss/plugin");

const tailwindColors = Object.fromEntries(
  Object.entries(themeColors).map(([name, swatch]) => [
    name,
    {
      DEFAULT: `var(--color-${name})`,
      light: swatch.light,
      dark: swatch.dark,
    },
  ]),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  // Scan all component and app files for Tailwind classes
  content: ["./app/**/*.{js,ts,tsx}", "./components/**/*.{js,ts,tsx}", "./lib/**/*.{js,ts,tsx}", "./hooks/**/*.{js,ts,tsx}"],

  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: tailwindColors,
      // Medium, consistent typography scale used across every screen.
      fontSize: {
        xs: ["12px", { lineHeight: "17px" }],
        sm: ["14px", { lineHeight: "20px" }],
        base: ["15px", { lineHeight: "22px" }],
        lg: ["18px", { lineHeight: "25px" }],
        xl: ["21px", { lineHeight: "28px" }],
        "2xl": ["24px", { lineHeight: "31px" }],
        "3xl": ["28px", { lineHeight: "35px" }],
        "4xl": ["32px", { lineHeight: "38px" }],
      },
    },
  },
  plugins: [
    plugin(({ addVariant }) => {
      addVariant("light", ':root:not([data-theme="dark"]) &');
      addVariant("dark", ':root[data-theme="dark"] &');
    }),
  ],
};
