/**
 * Converter for DISTINCT operations
 */

import type { ConversionContext } from "../converter.js";

export function convertDistinct(_context: ConversionContext): void {
  // DISTINCT doesn't need conversion - it's a flag operation
  // No expression conversion needed
}
