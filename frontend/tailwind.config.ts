import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#185FA5',
          light: '#E6F1FB',
        },
        success: {
          DEFAULT: '#1D9E75',
          light: '#EAF3DE',
        },
        warning: {
          DEFAULT: '#D97706',
          light: '#FAEEDA',
        },
        danger: {
          DEFAULT: '#E24B4A',
          light: '#FCEBEB',
        },
        purple: {
          DEFAULT: '#7C3AED',
          light: '#EDE9FE',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        '2xs': '0.625rem',
        '2-xs': '0.625rem',
      },
      borderWidth: {
        '2.5': '2.5px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}
export default config
