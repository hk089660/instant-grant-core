export * from './adminTheme';

export const masterTheme = {
    colors: {
        background: '#0D0D0D', // Very dark grey, almost black
        surface: '#1A1A1A',
        text: '#FFFFFF',
        textSecondary: '#AAAAAA',
        border: '#333333',
        primary: '#FF4444', // Red accent for master
        danger: '#FF0000',
    },
    spacing: {
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
    },
    radius: {
        sm: 4,
        md: 8,
        lg: 16,
    }
} as const;
