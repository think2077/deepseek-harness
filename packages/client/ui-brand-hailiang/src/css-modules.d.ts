declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

/** Vite emits imported raster artwork as a URL string. */
declare module 'hailiang:mark' {
  const source: string
  export default source
}

/** Full horizontal lockup used by the New Session hero. */
declare module 'hailiang:hero' {
  const source: string
  export default source
}
