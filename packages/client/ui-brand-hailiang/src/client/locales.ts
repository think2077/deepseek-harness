/** `brand.hailiang` namespace dictionaries for the Hailiang sidebar identity. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  productName: '教育共享数字员工协同平台',
} satisfies Record<string, string>

/** The Hailiang brand dictionary key union. */
export type HailiangBrandKey = keyof typeof zh

/** English dictionary, checked complete against the Chinese key set. */
export const en = {
  productName: 'Education Sharing Digital Employee Collaboration Platform',
} satisfies Record<HailiangBrandKey, string>
