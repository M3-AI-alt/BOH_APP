declare module '@boh/private-import' {
  const seed: typeof import('./import-placeholder').default;
  export default seed;
}
