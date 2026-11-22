/**
 * Single source of truth for money display.
 *
 * Two different null semantics are intentional:
 *   - Customer-facing prices fall back to "Price on request" so a missing
 *     price never looks like a free or zero-cost item.
 *   - Back-office screens use "—" because an absent figure is missing data,
 *     not a price the shop is quoting.
 *
 * Paystack and most order RPCs store integer kobo, so kobo values are divided
 * exactly once, here, instead of at each call site.
 */

const NGN = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

const hasValue = (value) => value != null && value !== '' && !Number.isNaN(Number(value));

/** Customer-facing amount in naira; missing values read as "Price on request". */
export const formatNaira = (value) => (hasValue(value) ? NGN.format(Number(value)) : 'Price on request');

/** Back-office amount in naira; missing values render as an em dash. */
export const formatNairaDash = (value) => (hasValue(value) ? NGN.format(Number(value)) : '—');

/** Integer kobo as naira, treating missing/invalid input as zero. */
export const formatKobo = (value) => NGN.format(Math.round(Number(value) || 0) / 100);

/** Back-office integer-kobo amount; missing values render as an em dash. */
export const formatKoboDash = (value) => (hasValue(value) ? formatKobo(value) : '—');
