import { create } from 'zustand'

const getInitialTheme = () => {
  const saved = localStorage.getItem('theme')
  if (saved) return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const useThemeStore = create((set) => ({
  theme: getInitialTheme(),

  toggleTheme: () => set((state) => {
    const next = state.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', next)
    document.documentElement.setAttribute('data-theme', next)
    return { theme: next }
  }),

  init: () => {
    const theme = getInitialTheme()
    document.documentElement.setAttribute('data-theme', theme)
    set({ theme })
  },
}))
