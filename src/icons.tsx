import type { ReactNode, SVGProps } from 'react'

type IconName = 'home' | 'users' | 'help' | 'account' | 'file' | 'upload' | 'check' | 'alert' | 'chevron' | 'logout' | 'search' | 'shield' | 'clock' | 'arrowLeft'

const paths: Record<IconName, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-5.5h5V20"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-3.3 2.3-5 5.5-5s5 1.7 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c2.8.1 4.3 1.8 4.5 4.5"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.8 1.9c-.9.6-1.6 1.1-1.6 2.3"/><path d="M12 17h.01"/></>,
  account: <><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6"/></>,
  file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></>,
  upload: <><path d="M12 16V5"/><path d="m8 9 4-4 4 4"/><path d="M5 15v5h14v-5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  alert: <><path d="M12 3 2.8 20h18.4z"/><path d="M12 9v4M12 17h.01"/></>,
  chevron: <path d="m9 6 6 6-6 6"/>,
  logout: <><path d="M10 5H5v14h5"/><path d="M13 8l4 4-4 4M8 12h9"/></>,
  search: <><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></>,
  shield: <><path d="M12 3 5 6v5c0 4.6 2.7 8 7 10 4.3-2 7-5.4 7-10V6z"/><path d="m9 12 2 2 4-4"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  arrowLeft: <><path d="m15 5-7 7 7 7"/><path d="M8 12h11"/></>,
}

export function Icon({ name, size = 22, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  )
}
