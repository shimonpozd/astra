const debugFlag =
  typeof import.meta !== "undefined"
    ? (import.meta.env?.VITE_DEBUG_LOGS ?? import.meta.env?.MODE === "development")
    : false

// Evaluate once at module load to avoid repeated string parsing
const DEBUG_ENABLED =
  typeof debugFlag === "string"
    ? ["1", "true", "yes", "on"].includes(debugFlag.toLowerCase())
    : Boolean(debugFlag)

/**
 * Lightweight wrapper around `console.log` that is active only when
 * `VITE_DEBUG_LOGS` is truthy (e.g. "true") or when running in development.
 * This helps keep production consoles quiet while still allowing developers
 * to opt into verbose diagnostics.
 */
export const debugLog = (...args: unknown[]) => {
  if (DEBUG_ENABLED) {
    // eslint-disable-next-line no-console
    console.log(...args)
  }
}

/**
 * Wrapper for `console.warn` honouring the same debug flag. Use for messages
 * that are helpful during development but too noisy for production.
 */
export const debugWarn = (...args: unknown[]) => {
  if (DEBUG_ENABLED) {
    // eslint-disable-next-line no-console
    console.warn(...args)
  }
}
