import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#F4F6F4',
        surface: '#FFFFFF',
        textPrimary: '#1B2E1B',
        matcha: '#81C784',
        matchaLight: '#A5D6A7',
        borderLight: '#DCE5DC',
        dangerFlat: '#D32F2F',
        dangerSurface: '#FDECEA',
        warningFlat: '#F57C00',
        warningSurface: '#FFF3E0',
        mutedText: '#4A634A',
      },
      borderRadius: {
        none: '0px',
        sm: '2px',
        DEFAULT: '2px',
        md: '2px',
        lg: '2px',
        xl: '2px',
        '2xl': '2px',
        '3xl': '2px',
        full: '2px',
      },
      transitionDuration: {
        DEFAULT: '150ms',
        150: '150ms',
      },
    },
    boxShadow: {
      none: 'none',
      sm: 'none',
      DEFAULT: 'none',
      md: 'none',
      lg: 'none',
      xl: 'none',
      '2xl': 'none',
      inner: 'none',
    },
    dropShadow: {
      none: '0 0 #0000',
      sm: '0 0 #0000',
      DEFAULT: '0 0 #0000',
      md: '0 0 #0000',
      lg: '0 0 #0000',
      xl: '0 0 #0000',
      '2xl': '0 0 #0000',
    },
    backgroundImage: {
      none: 'none',
    },
  },
  plugins: [],
};

export default config;