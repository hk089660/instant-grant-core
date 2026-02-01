/**
 * Unit tests for Phantom redirect / URL parsing. SECURITY_REVIEW P1-4.
 * - parsePhantomRedirect: invalid URL, missing params -> null
 * - isAllowedPhantomRedirectUrl: scheme/hostname validation
 * - handlePhantomConnectRedirect: missing params / invalid -> ok: false
 */

import * as expoLinking from 'expo-linking';

jest.mock('expo-linking', () => ({ parse: jest.fn() }));
jest.mock('react-native', () => ({ Linking: {}, Platform: { OS: 'android' }, ToastAndroid: {} }));
jest.mock('../../wallet/openPhantom', () => ({ openPhantomConnect: jest.fn(() => Promise.resolve()) }));
jest.mock('../phantomSignTxPending', () => ({
  setPendingSignTx: jest.fn(),
  resolvePendingSignTx: jest.fn(),
  rejectPendingSignTx: jest.fn(),
}));
jest.mock('../phantomUrlDebug', () => ({ setLastPhantomConnect: jest.fn(), setLastPhantomSign: jest.fn() }));
jest.mock('../devLog', () => ({ devLog: jest.fn(), devWarn: jest.fn(), devError: jest.fn() }));

const mockParse = expoLinking.parse as jest.MockedFunction<typeof expoLinking.parse>;

import {
  parsePhantomRedirect,
  isAllowedPhantomRedirectUrl,
  handlePhantomConnectRedirect,
} from '../phantom';

describe('parsePhantomRedirect', () => {
  it('returns null when data or nonce is missing', () => {
    mockParse.mockReturnValue({ queryParams: {} } as any);
    expect(parsePhantomRedirect('wene://phantom/connect')).toBeNull();

    mockParse.mockReturnValue({ queryParams: { data: 'abc' } } as any);
    expect(parsePhantomRedirect('wene://phantom/connect?data=abc')).toBeNull();

    mockParse.mockReturnValue({ queryParams: { nonce: 'def' } } as any);
    expect(parsePhantomRedirect('wene://phantom/connect?nonce=def')).toBeNull();
  });

  it('returns { data, nonce } when both present', () => {
    mockParse.mockReturnValue({ queryParams: { data: 'abc', nonce: 'def' } } as any);
    const result = parsePhantomRedirect('wene://phantom/connect?data=abc&nonce=def');
    expect(result).toEqual({ data: 'abc', nonce: 'def' });
  });

  it('returns null when parse throws', () => {
    mockParse.mockImplementation(() => {
      throw new Error('parse error');
    });
    expect(parsePhantomRedirect('invalid')).toBeNull();
  });
});

describe('isAllowedPhantomRedirectUrl', () => {
  it('returns true for wene://phantom/...', () => {
    mockParse.mockReturnValue({ scheme: 'wene', hostname: 'phantom' } as any);
    expect(isAllowedPhantomRedirectUrl('wene://phantom/connect')).toBe(true);
  });

  it('returns false when scheme is not wene', () => {
    mockParse.mockReturnValue({ scheme: 'https', hostname: 'phantom' } as any);
    expect(isAllowedPhantomRedirectUrl('https://phantom/connect')).toBe(false);
  });

  it('returns false when hostname is not phantom', () => {
    mockParse.mockReturnValue({ scheme: 'wene', hostname: 'other' } as any);
    expect(isAllowedPhantomRedirectUrl('wene://other/connect')).toBe(false);
  });

  it('returns false when parse throws', () => {
    mockParse.mockImplementation(() => {
      throw new Error('parse error');
    });
    expect(isAllowedPhantomRedirectUrl(':::')).toBe(false);
  });
});

describe('handlePhantomConnectRedirect', () => {
  const dummySecretKey = new Uint8Array(32);
  dummySecretKey.fill(1);

  beforeEach(() => {
    mockParse.mockReset();
  });

  it('returns ok: false when required params are missing', () => {
    mockParse.mockReturnValue({ queryParams: {} } as any);
    const result = handlePhantomConnectRedirect('wene://phantom/connect', dummySecretKey);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('check_params');
      expect(result.error).toContain('Missing');
    }
  });

  it('returns ok: false when errorCode in query', () => {
    mockParse.mockReturnValue({
      queryParams: { errorCode: '4001', errorMessage: 'User denied' },
    } as any);
    const result = handlePhantomConnectRedirect('wene://phantom/connect', dummySecretKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).toBe('error_response');
  });

  it('returns ok: false when data/nonce/phantom_encryption_public_key missing', () => {
    mockParse.mockReturnValue({
      queryParams: { data: 'x', nonce: 'y' },
    } as any);
    const result = handlePhantomConnectRedirect('wene://phantom/connect', dummySecretKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).toBe('check_params');
  });
});
