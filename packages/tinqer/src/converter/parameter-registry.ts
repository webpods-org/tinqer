/**
 * Immutable parameter registry for tracking auto-generated parameters
 */

export interface ParameterInfo {
  name: string;
  value: unknown;
}

export interface ParameterRegistry {
  readonly parameters: ReadonlyArray<ParameterInfo>;
  readonly counter: number;
}

/**
 * Create an empty parameter registry
 */
export function createRegistry(): ParameterRegistry {
  return {
    parameters: [],
    counter: 0,
  };
}

/**
 * Add a parameter to the registry and return a new registry
 */
export function addParameter(
  registry: ParameterRegistry,
  value: unknown
): [ParameterRegistry, string] {
  const paramName = `__p${registry.counter}`;
  const newRegistry: ParameterRegistry = {
    parameters: [...registry.parameters, { name: paramName, value }],
    counter: registry.counter + 1,
  };
  return [newRegistry, paramName];
}

/**
 * Get parameters as an object for SQL execution
 */
export function getParametersObject(registry: ParameterRegistry): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const param of registry.parameters) {
    result[param.name] = param.value;
  }
  return result;
}

/**
 * Merge two registries (used when combining subqueries)
 */
export function mergeRegistries(
  first: ParameterRegistry,
  second: ParameterRegistry
): ParameterRegistry {
  // Renumber second registry's parameters to avoid conflicts
  const offset = first.counter;
  const renamedParams = second.parameters.map((param, index) => ({
    name: `__p${offset + index}`,
    value: param.value,
  }));

  return {
    parameters: [...first.parameters, ...renamedParams],
    counter: first.counter + second.counter,
  };
}