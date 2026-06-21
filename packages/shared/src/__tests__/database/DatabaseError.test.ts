import {
  DatabaseError,
  ConstraintError,
  ConnectionError,
} from '../../data/database/DatabaseError.js';

describe('DatabaseError', () => {
  it('is an instance of Error', () => {
    const err = new DatabaseError('test message');
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of DatabaseError', () => {
    const err = new DatabaseError('test message');
    expect(err).toBeInstanceOf(DatabaseError);
  });

  it('has the correct name', () => {
    const err = new DatabaseError('test message');
    expect(err.name).toBe('DatabaseError');
  });

  it('has the correct message', () => {
    const err = new DatabaseError('something went wrong');
    expect(err.message).toBe('something went wrong');
  });

  it('stores optional sql property', () => {
    const err = new DatabaseError('fail');
    err.sql = 'SELECT * FROM bad';
    expect(err.sql).toBe('SELECT * FROM bad');
  });

  it('stores optional params property', () => {
    const err = new DatabaseError('fail');
    err.params = [1, 'two'];
    expect(err.params).toEqual([1, 'two']);
  });

  it('stores optional code property', () => {
    const err = new DatabaseError('fail');
    err.code = 'SQLITE_ERROR';
    expect(err.code).toBe('SQLITE_ERROR');
  });

  it('supports error chaining via cause', () => {
    const cause = new Error('original');
    const err = new DatabaseError('wrapped', { cause });
    expect(err.cause).toBe(cause);
  });
});

describe('ConstraintError', () => {
  it('is an instance of ConstraintError', () => {
    const err = new ConstraintError('constraint violation');
    expect(err).toBeInstanceOf(ConstraintError);
  });

  it('is an instance of DatabaseError', () => {
    const err = new ConstraintError('constraint violation');
    expect(err).toBeInstanceOf(DatabaseError);
  });

  it('is an instance of Error', () => {
    const err = new ConstraintError('constraint violation');
    expect(err).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    const err = new ConstraintError('constraint violation');
    expect(err.name).toBe('ConstraintError');
  });

  it('is NOT an instance of ConnectionError', () => {
    const err = new ConstraintError('constraint violation');
    expect(err).not.toBeInstanceOf(ConnectionError);
  });

  it('stores optional constraint property', () => {
    const err = new ConstraintError('fk violation');
    err.constraint = 'FOREIGN KEY';
    expect(err.constraint).toBe('FOREIGN KEY');
  });
});

describe('ConnectionError', () => {
  it('is an instance of ConnectionError', () => {
    const err = new ConnectionError('connection failed');
    expect(err).toBeInstanceOf(ConnectionError);
  });

  it('is an instance of DatabaseError', () => {
    const err = new ConnectionError('connection failed');
    expect(err).toBeInstanceOf(DatabaseError);
  });

  it('is an instance of Error', () => {
    const err = new ConnectionError('connection failed');
    expect(err).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    const err = new ConnectionError('connection failed');
    expect(err.name).toBe('ConnectionError');
  });

  it('is NOT an instance of ConstraintError', () => {
    const err = new ConnectionError('connection failed');
    expect(err).not.toBeInstanceOf(ConstraintError);
  });
});
