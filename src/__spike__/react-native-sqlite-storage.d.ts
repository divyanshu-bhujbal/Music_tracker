declare module 'react-native-sqlite-storage' {
  interface Database {
    transaction(
      callback: (tx: Transaction) => void,
      error?: (error: Error) => void,
      success?: () => void,
    ): void;
    close(): void;
  }

  interface Transaction {
    executeSql(
      statement: string,
      arguments?: any[],
      callback?: (tx: Transaction, results: ResultSet) => void,
      errorCallback?: (tx: Transaction, error: Error) => boolean,
    ): void;
  }

  interface ResultSet {
    insertId: number;
    rowsAffected: number;
    rows: {
      length: number;
      item: (index: number) => any;
      raw: () => any[];
    };
  }

  function openDatabase(
    name: string,
    version: string,
    displayName: string,
    size: number,
    success?: () => void,
    error?: (error: Error) => void,
  ): Database;

  function enablePromise(enablePromise: boolean): void;

  const SQLite: {
    openDatabase: typeof openDatabase;
    enablePromise: typeof enablePromise;
  };

  export default SQLite;
}
