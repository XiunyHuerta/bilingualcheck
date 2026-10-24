import { useWindowDimensions } from "react-native";

import { MAX_WIDTH } from "./tokens";

export const breakpoints = { tablet: 768, desktop: 1024, wide: 1440 } as const;
export const contentWidths = {
  page: 1280,
  reading: 960,
  compact: 560,
} as const;

/** Recalculates on resize, including browser zoom and split-screen windows. */
export function useResponsive() {
  const { width } = useWindowDimensions();
  const isTablet = width >= breakpoints.tablet;
  const isDesktop = width >= breakpoints.desktop;
  const isWide = width >= breakpoints.wide;
  return {
    isTablet,
    isDesktop,
    isWide,
    pageWidth: isTablet ? contentWidths.page : MAX_WIDTH,
    gutter: isDesktop ? 32 : isTablet ? 24 : 16,
    projectColumns: isWide ? 3 : isTablet ? 2 : 1,
    languageColumns: isWide ? 4 : isDesktop ? 3 : isTablet ? 2 : 1,
  };
}
