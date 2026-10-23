// Bộ icon stroke 20px dùng cho shell — vẽ tay bằng path, không phụ thuộc thư viện ngoài.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconGrid = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
  </Base>
);

export const IconChart = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20V9.5" />
    <path d="M9.33 20V4.5" />
    <path d="M14.66 20v-7" />
    <path d="M20 20V7" />
  </Base>
);

export const IconBolt = (p: IconProps) => (
  <Base {...p}>
    <path d="M13.5 3 5.8 13.2h5.1L10.5 21l7.7-10.2h-5.1z" />
  </Base>
);

export const IconMegaphone = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 10.5v3a1.5 1.5 0 0 0 1.5 1.5h1.7L14 19V5L7.2 9H5.5A1.5 1.5 0 0 0 4 10.5Z" />
    <path d="M17 8.5a4.6 4.6 0 0 1 0 7" />
    <path d="M6.8 15v3.2a1.8 1.8 0 0 0 3.6 0V16" />
  </Base>
);

export const IconPlug = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 3.5v4M15 3.5v4" />
    <path d="M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0z" />
    <path d="M12 16v4.5" />
  </Base>
);

export const IconPulse = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 12.5h3.2l2.2-6 3 11 2.4-7 1.7 2h4.5" />
  </Base>
);

export const IconLifebuoy = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.4" />
    <path d="m6.4 6.4 3.4 3.4M14.2 14.2l3.4 3.4M17.6 6.4l-3.4 3.4M9.8 14.2l-3.4 3.4" />
  </Base>
);

export const IconBook = (p: IconProps) => (
  <Base {...p}>
    <path d="M4.5 5.2A2.2 2.2 0 0 1 6.7 3h12.8v15.6H6.7a2.2 2.2 0 0 0-2.2 2.2z" />
    <path d="M4.5 5.2v15.6" />
    <path d="M8.8 7.6h6.6" />
  </Base>
);

export const IconSearch = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6.6" />
    <path d="m16 16 4.2 4.2" />
  </Base>
);

export const IconChevron = (p: IconProps) => (
  <Base {...p}>
    <path d="m6.5 9.5 5.5 5 5.5-5" />
  </Base>
);

export const IconCollapse = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <path d="M9.5 4.5v15" />
    <path d="m14 10 2 2-2 2" />
  </Base>
);

export const IconSparkle = (p: IconProps) => (
  <Base {...p}>
    <path d="m12 3.5 1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" />
    <path d="M18.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
  </Base>
);

export const IconBell = (p: IconProps) => (
  <Base {...p}>
    <path d="M18 15.5V10a6 6 0 1 0-12 0v5.5L4.5 18h15z" />
    <path d="M9.8 21a2.4 2.4 0 0 0 4.4 0" />
  </Base>
);

export const IconTarget = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" />
  </Base>
);

export const IconEye = (p: IconProps) => (
  <Base {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Base>
);

export const IconUpload = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 16.5V5" />
    <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
    <path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15" />
  </Base>
);

export const IconMoon = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z" />
  </Base>
);

export const IconSun = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.6v2.2M12 19.2v2.2M4.2 12H2M22 12h-2.2M5.6 5.6 4 4M20 20l-1.6-1.6M18.4 5.6 20 4M4 20l1.6-1.6" />
  </Base>
);

export const IconHelp = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.3a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1 1-1.1 1.8v.3" />
    <path d="M12 17h.01" />
  </Base>
);

export const IconFeedback = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 5.5H4v11h5l3 3 3-3h5z" />
    <path d="M8.5 10.5h7" />
  </Base>
);

export const IconArrowRight = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12h13" />
    <path d="m13 7 5 5-5 5" />
  </Base>
);

export const IconLayers = (p: IconProps) => (
  <Base {...p}>
    <path d="m12 3.5 8 4.2-8 4.2-8-4.2z" />
    <path d="m4 12.2 8 4.2 8-4.2" />
    <path d="m4 16.4 8 4.1 8-4.1" />
  </Base>
);

export const IconWarning = (p: IconProps) => (
  <Base {...p}>
    <path d="M10.6 4.3 2.9 17.4a1.6 1.6 0 0 0 1.4 2.4h15.4a1.6 1.6 0 0 0 1.4-2.4L13.4 4.3a1.6 1.6 0 0 0-2.8 0Z" />
    <path d="M12 9v4.4" />
    <path d="M12 16.7h.01" />
  </Base>
);

export const IconCalendar = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M8 3v4M16 3v4M3.5 10h17" />
  </Base>
);

export const IconInfo = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.2" />
    <path d="M12 7.9h.01" />
  </Base>
);

export const IconPlus = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="m5 12.8 4.4 4.4L19 7.5" />
  </Base>
);


export const IconFilter = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 6h16" />
    <path d="M7 12h10" />
    <path d="M10 18h4" />
  </Base>
);

export const IconCopy = (p: IconProps) => (
  <Base {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6.5A2.5 2.5 0 0 0 4 5.5v6A2.5 2.5 0 0 0 6.5 14" />
  </Base>
);

export const IconKey = (p: IconProps) => (
  <Base {...p}>
    <circle cx="8.5" cy="15.5" r="3.5" />
    <path d="M11 13l7.5-7.5" />
    <path d="M15.5 8.5l2 2" />
    <path d="M18 6l2 2" />
  </Base>
);

export const IconMore = (p: IconProps) => (
  <Base {...p}>
    <circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </Base>
);

export const IconRefresh = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 6.3" />
    <path d="M20 4.5V11h-6.5" />
  </Base>
);

export const IconTerminal = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 7l4 4-4 4" />
    <path d="M12 16h7" />
  </Base>
);

export const IconLock = (p: IconProps) => (
  <Base {...p}>
    <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
    <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
  </Base>
);

export const IconSettings = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15H4.4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.3-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11.5 4.6V4.4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.3 2.9h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.1.5z" />
  </Base>
);

export const IconExternal = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4l-8 8" />
    <path d="M18 14v5.5A1.5 1.5 0 0 1 16.5 21h-11A1.5 1.5 0 0 1 4 19.5v-11A1.5 1.5 0 0 1 5.5 7H11" />
  </Base>
);

export const IconColumns = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M9.5 4.5v15" />
    <path d="M15 4.5v15" />
  </Base>
);

export const IconStar = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.8l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 10l5.9-.9z" />
  </Base>
);

export const IconArrowUp = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 19V5" />
    <path d="M6 11l6-6 6 6" />
  </Base>
);

export const IconArrowDown = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14" />
    <path d="M6 13l6 6 6-6" />
  </Base>
);

export const IconClose = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </Base>
);
