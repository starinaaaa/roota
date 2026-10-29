// Keep the apartment in the order/draft, but out of address suggestion requests.
export function splitCourierAddress(value: string) {
  const match = /,\s*(?:кв\.?|квартира|офис)\s+(.+)$/iu.exec(value);
  return match
    ? { address: value.slice(0, match.index), apartment: match[1] }
    : { address: value, apartment: "" };
}

export function joinCourierAddress(address: string, apartment: string) {
  return `${address}${apartment.trim() ? `, кв. ${apartment}` : ""}`;
}
