/**
 * Iconografia outline del design system, como SVG inline.
 *
 * Van inline y no como archivos sueltos por dos razones: heredan `currentColor`,
 * asi que el sidebar los pinta sin CSS extra, y no agregan pedidos de red ni una
 * dependencia de iconos para trece dibujos.
 */

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const Icons = {
  home: (p) => (
    <svg {...base} {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9.5 21v-6h5v6" /></svg>
  ),
  mobility: (p) => (
    <svg {...base} {...p}><circle cx="5.5" cy="17" r="3.5" /><circle cx="18.5" cy="17" r="3.5" /><path d="m5.5 17 4-9h5l4 9" /><path d="M9 8h5" /></svg>
  ),
  waste: (p) => (
    <svg {...base} {...p}><path d="M4 7h16" /><path d="M9 7V4.5h6V7" /><path d="M6 7v13h12V7" /><path d="M10 11v5M14 11v5" /></svg>
  ),
  complaints: (p) => (
    <svg {...base} {...p}><path d="M20 4H4v12h5l3 4 3-4h5z" /><path d="M12 7.5v4M12 14h.01" /></svg>
  ),
  emergencies: (p) => (
    <svg {...base} {...p}><path d="M12 3.5 22 20H2z" /><path d="M12 10v4.5M12 17.5h.01" /></svg>
  ),
  spaces: (p) => (
    <svg {...base} {...p}><path d="M12 3 5 13h4l-3 4h12l-3-4h4z" /><path d="M12 17v4" /></svg>
  ),
  culture: (p) => (
    <svg {...base} {...p}><path d="M3 8.5a2 2 0 0 0 0 4V17h18v-4.5a2 2 0 0 1 0-4V7H3z" /><path d="M12 7v10" strokeDasharray="2 2" /></svg>
  ),
  analytics: (p) => (
    <svg {...base} {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
  ),
  map: (p) => (
    <svg {...base} {...p}><path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
  ),
  zones: (p) => (
    <svg {...base} {...p}><path d="m9 3 6 2 6-2v16l-6 2-6-2-6 2V5z" /><path d="M9 3v16M15 5v16" /></svg>
  ),
  alerts: (p) => (
    <svg {...base} {...p}><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6z" /><path d="M13.7 20a2 2 0 0 1-3.4 0" /></svg>
  ),
  fleet: (p) => (
    <svg {...base} {...p}><path d="M2 7h11v9H2z" /><path d="M13 10h4.5l3.5 3.5V16H13z" /><circle cx="6" cy="18.5" r="2" /><circle cx="17" cy="18.5" r="2" /></svg>
  ),
  routes: (p) => (
    <svg {...base} {...p}><circle cx="5.5" cy="6" r="2.5" /><circle cx="18.5" cy="18" r="2.5" /><path d="M5.5 8.5v4a3.5 3.5 0 0 0 3.5 3.5h6" /><path d="M13 13.5 16 16l-3 2.5" /></svg>
  ),
  profile: (p) => (
    <svg {...base} {...p}><circle cx="12" cy="8.5" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>
  ),
  lock: (p) => (
    <svg {...base} {...p} width={13} height={13}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>
  ),
};
