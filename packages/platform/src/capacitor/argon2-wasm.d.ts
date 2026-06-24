declare module 'argon2-wasm' {
  export interface Argon2Options {
    pass: Uint8Array;
    salt: Uint8Array;
    time: number;
    mem: number;
    parallelism: number;
    hashLen: number;
    type: number;
  }

  export interface Argon2Result {
    hash: Uint8Array;
    hashHex: string;
    encoded: string;
  }

  export const types: {
    Argon2d: 0;
    Argon2i: 1;
    Argon2id: 2;
    Argon2u: 10;
  };

  export function hash(args: Argon2Options): Promise<Argon2Result>;
}
