import type { WeatherId } from './config'

type IconName = WeatherId | 'brand' | 'sliders' | 'headphones' | 'music' | 'play' | 'pause' | 'upload' | 'list' | 'volume' | 'wind' | 'close' | 'reset' | 'drag' | 'trash' | 'previous' | 'next'

const drawings: Record<IconName, React.ReactNode> = {
  brand: <><path d="M12 2.5 21.5 8 12 13.5 2.5 8 12 2.5Z"/><path d="m2.5 12.5 9.5 5.5 9.5-5.5M2.5 17l9.5 5.5 9.5-5.5"/></>,
  sunny: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42m0-14.14-1.42 1.42m-11.3 11.3-1.42 1.42"/></>,
  cloudy: <path d="M6.5 18a4.75 4.75 0 1 1 .9-9.41A5.75 5.75 0 0 1 18 10h.5a4 4 0 0 1 0 8h-12Z"/>,
  rainy: <><path d="M6 14.5a3.8 3.8 0 1 1 1.1-7.44A5.4 5.4 0 0 1 17.2 8h.8a3.25 3.25 0 0 1 0 6.5M8 17l-1.2 3m5.2-3-1.2 3m5.2-3-1.2 3"/></>,
  snow: <><path d="M12 2v20M3.35 7l17.3 10M3.35 17l17.3-10M9 4l3 2 3-2M9 20l3-2 3 2M3.6 10.5l3.3-1.6V5.3m10.2 13.4v-3.6l3.3-1.6M3.6 13.5l3.3 1.6v3.6M17.1 5.3v3.6l3.3 1.6"/></>,
  sliders: <><path d="M4 6h4m4 0h8M4 12h9m4 0h3M4 18h2m4 0h10"/><circle cx="10" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/></>,
  headphones: <><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="3" y="13" width="4" height="7" rx="1.6"/><rect x="17" y="13" width="4" height="7" rx="1.6"/></>,
  music: <><path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="17.5" rx="3" ry="2.5"/><ellipse cx="17" cy="15.5" rx="3" ry="2.5"/></>,
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" strokeWidth="1.3"/>,
  pause: <><path d="M9 5.5v13m6-13v13" strokeWidth="3"/></>,
  upload: <><path d="M12 15V3m-4 4 4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></>,
  list: <><path d="M4 6h16M4 11h16M4 16h7m4 0v5l5-2.5-5-2.5Z"/></>,
  volume: <><path d="M4 9h4l5-4v14l-5-4H4V9Zm12 0a4 4 0 0 1 0 6m2.5-8.5a7.5 7.5 0 0 1 0 11"/></>,
  wind: <><path d="M3 8h12a2.5 2.5 0 1 0-2.5-2.5M3 12h16a2 2 0 1 1-2 2m-14 2h8a2.5 2.5 0 1 1-2.5 2.5"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  reset: <path d="M4 11a8 8 0 1 1 1.8 6M4 5v6h6"/>,
  drag: <><path d="M12 3v18M3 12h18M9 6l3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></>,
  previous: <><path d="M5 5v14m13-13L8 12l10 6V6Z"/></>,
  next: <><path d="M19 5v14M6 6l10 6-10 6V6Z"/></>,
}

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">{drawings[name]}</svg>
}
