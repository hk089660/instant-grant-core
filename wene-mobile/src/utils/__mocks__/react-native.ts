/** Mock for Jest: react-native (phantom.ts uses Linking, Platform, ToastAndroid) */
export const Linking = { addEventListener: jest.fn(), getInitialURL: jest.fn() };
export const Platform = { OS: 'android' };
export const ToastAndroid = { show: jest.fn(), LONG: 1, SHORT: 0 };
