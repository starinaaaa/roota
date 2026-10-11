// PostgREST returns unique foreign-key relations as an object, other relations as arrays.
export function relationList<T>(value: T | T[] | null | undefined): T[] {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}
