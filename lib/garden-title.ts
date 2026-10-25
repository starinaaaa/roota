/** Add the product type without changing the saved bundle name or composition. */
export function gardenProductTitle(name: string): string {
  return name.replace(/^Сад(?=$|\s|[—–-])/iu, 'Керамический конструктор «Сад»');
}
