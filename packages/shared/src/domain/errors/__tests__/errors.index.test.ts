import { AuthenticationError, FormatError, VersionError } from '../index.js';

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
});
