/** `brand.hailiang` namespace dictionaries for the Hailiang sidebar identity. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  productName: '数字员工协同平台',
} satisfies Record<string, string>

/** The Hailiang brand dictionary key union. */
export type HailiangBrandKey = keyof typeof zh

/** English dictionary, checked complete against the Chinese key set. */
export const en = {
  productName: 'Digital Employee Collaboration Platform',
} satisfies Record<HailiangBrandKey, string>
