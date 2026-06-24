import { AuthenticationError } from '../AuthenticationError.js';

describe('AuthenticationError', () => {
  it('is an instance of Error', () => {
    const err = new AuthenticationError('test message');
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of AuthenticationError', () => {
    const err = new AuthenticationError('test message');
    expect(err).toBeInstanceOf(AuthenticationError);
  });

  it('has the correct name', () => {
    const err = new AuthenticationError('test message');
    expect(err.name).toBe('AuthenticationError');
  });

  it('has the correct message', () => {
    const err = new AuthenticationError('Decryption failed: authentication tag mismatch');
    expect(err.message).toBe('Decryption failed: authentication tag mismatch');
  });
});
