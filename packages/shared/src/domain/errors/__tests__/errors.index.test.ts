import {
  AuthenticationError,
  FormatError,
  VersionError,
  AuthCancelledError,
  AuthNetworkError,
} from '../index.js';

describe('domain/errors barrel', () => {
  it('exports AuthenticationError', () => {
    const err = new AuthenticationError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AuthenticationError');
  });

  it('exports FormatError', () => {
    const err = new FormatError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('FormatError');
  });

  it('exports VersionError', () => {
    const err = new VersionError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('VersionError');
  });

  it('exports AuthCancelledError', () => {
    const err = new AuthCancelledError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AuthCancelledError');
  });

  it('exports AuthNetworkError', () => {
    const err = new AuthNetworkError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AuthNetworkError');
  });
});
