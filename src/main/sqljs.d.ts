declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: any;
    // Additional types can be added as needed
    [key: string]: any;
  }
  const initSqlJs: () => Promise<SqlJsStatic>;
  export default initSqlJs;
}
