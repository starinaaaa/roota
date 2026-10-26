import source from "./catalog-source.json";
export const plates = source;
export type Plate = (typeof plates)[number];
export const money = (value: number) =>
  new Intl.NumberFormat("ru-RU").format(value) + " ₽";
export const plateTitle = (p: Plate) => `Тарелка «${p.name}»`;
