declare module 'papaparse' {
  const Papa: { parse<T = unknown>(text: string, config?: Record<string, unknown>): { data: T[] } };
  export default Papa;
}
