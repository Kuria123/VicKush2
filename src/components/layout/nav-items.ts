/**
 * Primary navigation.
 *
 * Declared `as const` (rather than annotated as an interface) so each `href`
 * keeps its literal type. Next's `typedRoutes` validates those literals
 * against the real route tree at build time, so a broken link fails the build.
 *
 * `status: 'planned'` routes exist and render an honest "not implemented"
 * page. They never show placeholder vehicle or diagnostic values.
 */
export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', status: 'available' },
  { href: '/vehicles', label: 'My Vehicles', status: 'available' },
  { href: '/diagnostics', label: 'Diagnostics', status: 'planned' },
  { href: '/live-scan', label: 'Live Scan', status: 'available' },
  { href: '/health', label: 'Vehicle Health', status: 'planned' },
  { href: '/settings', label: 'Settings', status: 'planned' },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];
