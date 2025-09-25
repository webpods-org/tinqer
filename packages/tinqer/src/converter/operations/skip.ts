/**
 * Converter for SKIP operations
 */

import type { ConversionContext } from "../converter.js";
import type { ConstantExpression } from "../../expressions/expression.js";
import { addParameter } from "../parameter-registry.js";

export function convertSkip(
  count: number,
  context: ConversionContext,
): { expression: ConstantExpression; registry: ConversionContext["registry"] } {
  const expression: ConstantExpression = {
    type: "constant",
    value: count,
  };

  // Add to parameter registry for SQL generation
  const [registry] = addParameter(context.registry, count);

  return { expression, registry };
}
