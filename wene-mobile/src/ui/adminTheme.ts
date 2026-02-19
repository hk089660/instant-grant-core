import { spacing, radius, typography } from './theme';

export const adminColors = {
  background: '#000000',
  surface: '#111111',
  text: '#ffffff',
  textSecondary: '#ffffff',
  textTertiary: '#ffffff',
  border: '#333333',
  divider: '#333333',
  primary: '#ffffff',
  muted: '#666666',
} as const;

export const adminTheme = {
  colors: adminColors,
  spacing,
  radius,
  typography,
} as const;
