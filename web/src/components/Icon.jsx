import React from 'react';

/** 线性图标集（1.6 描边，跟随 currentColor），替代散落各处的 emoji */
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9',
  chat: 'M4 5h16v11H9l-5 4z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  check: 'M5 12.5 10 17 19 7',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  close: 'M6 6l12 12M18 6 6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  send: 'M5 12h14M13 6l6 6-6 6',
  stop: 'M7 7h10v10H7z',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  expand: 'M7 10l5 5 5-5',
  collapse: 'M7 14l5-5 5 5',
  select: 'M4 4h16v16H4zM8 12l3 3 5-6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  play: 'M7 5v14l11-7z',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  note: 'M5 4h14v12l-4 4H5zM15 20v-4h4M9 9h6M9 13h4',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  sort: 'M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
};

export default function Icon({ name, size = 16, className = '', strokeWidth = 1.6, ...rest }) {
  return (
    <svg
      className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/**
 * 批改记号：模仿老师红笔判卷
 * good = 勾，partial = 半对（勾上加一撇），poor = 叉
 */
export function GradeMark({ quality, size = 22 }) {
  return (
    <svg
      className={`grade grade-${quality}`} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      {quality === 'good' && <path d="M4 12.5c2 1.6 3.4 3.4 4.6 5.6C11 12 15 7.5 20.5 4.5" />}
      {quality === 'partial' && (
        <>
          <path d="M4 12.5c2 1.6 3.4 3.4 4.6 5.6C11 12 15 7.5 20.5 4.5" />
          <path d="M12.5 9.5l5 5.5" />
        </>
      )}
      {quality === 'poor' && (
        <>
          <path d="M5.5 5.5c4.5 4 8.5 8.6 13 13.2" />
          <path d="M18.5 5c-4.2 4.6-8.4 9-13 13.6" />
        </>
      )}
    </svg>
  );
}
