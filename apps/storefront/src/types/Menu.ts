export type Menu = {
  id: number;
  title: string;
  path?: string;
  newTab: boolean;
  /** Shown in submenu on mobile only (e.g. "All …" parent link). */
  mobileOnly?: boolean;
  submenu?: Menu[];
};
