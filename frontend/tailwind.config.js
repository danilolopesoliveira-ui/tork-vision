/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        petroleum: {
          300: '#5B8DB8',
          400: '#2D6A9F',
          500: '#0F4C75',
          600: '#0D3F63',
          700: '#0A2F4A',
          800: '#071F30',
        },
        'orange-accent': '#FF6B35',
        'orange-light': '#FF8C5A',
        surface: {
          dark: '#0D1B2A',
          darker: '#0A0F1E',
          light: '#F8FAFC',
          card: '#132233',
        },
        'border-dark': '#1E3A5F',
        'border-light': '#E2E8F0',
        'text-primary': '#E8F4F8',
        'text-secondary': '#8AA8C0',
        success: '#00D4AA',
        warning: '#FFB800',
        danger: '#FF4444',
      },
      animation: {
        'count-up': 'countUp 0.8s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'pulse-slow': 'pulse 3s infinite',
        shimmer: 'shimmer 1.5s infinite',
      },
      keyframes: {
        countUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backgroundImage: {
        'shimmer-gradient':
          'linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.05) 50%, transparent 75%)',
      },
      boxShadow: {
        card: '0 4px 20px rgba(0, 0, 0, 0.4)',
        'card-hover': '0 8px 30px rgba(0, 0, 0, 0.5)',
        glow: '0 0 20px rgba(15, 76, 117, 0.4)',
        'glow-orange': '0 0 20px rgba(255, 107, 53, 0.3)',
      },
    },
  },
  plugins: [],
}
