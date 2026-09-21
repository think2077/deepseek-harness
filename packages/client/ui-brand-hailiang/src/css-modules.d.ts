declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

/** Vite emits imported raster artwork as a URL string. */
declare module 'hailiang:mark' {
  const source: string
  export default source
}
