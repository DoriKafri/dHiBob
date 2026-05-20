import type { Config } from 'tailwindcss'
import forms from '@tailwindcss/forms'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: { 50: '#fdf1f3', 100: '#fce6e9', 200: '#f9cdd6', 300: '#f4a5b5', 400: '#ed7088', 500: '#E33054', 600: '#c9224a', 700: '#a91a40', 800: '#8d163b', 900: '#751437' },
        cherry: '#E33054',
        secondary: { 50: '#fffbf5', 100: '#fef7ed', 200: '#feecd4', 300: '#fdd9ad', 400: '#fbc178', 500: '#FFA32B', 600: '#f28d1a', 700: '#d97014', 800: '#b85d16', 900: '#964c13' },
        orange: '#FFA32B',
        wine: { 50: '#faf6f8', 500: '#b57499', 700: '#83143D', 800: '#60032A', 900: '#4a0220' },
        charcoal: { 50: '#f9f9f8', 100: '#f3f3f2', 200: '#e8e8e6', 500: '#9b9b97', 600: '#6b6b66', 700: '#3A3A37', 800: '#2b2b28', 900: '#1f1f1c' },
      },
      fontFamily: { sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'] },
    },
  },
  plugins: [forms],
}
export default config
