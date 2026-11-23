import { useEffect, useState } from 'react'

export function usePreference<T extends string>(name: string, choices: readonly T[], fallback: T) {
  const key = `weather-glass:${name}`
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key)
      return choices.find((choice) => choice === saved) ?? fallback
    } catch { return fallback }
  })

  useEffect(() => {
    try { localStorage.setItem(key, value) } catch { /* Use session state when storage is unavailable. */ }
  }, [key, value])

  return [value, setValue] as const
}
