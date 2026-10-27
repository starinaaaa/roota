import "server-only";
// The review shares the live database. Hide the explicitly requested demo records
// only on the review host; no DELETE, order transition or stock change is issued.
const reviewing = Boolean(process.env.ROOTA_REVIEW_HOST);
export const reviewHidden = {
  customers: reviewing
    ? [
        "a68c024d-2d9a-4f80-9a67-e7469976d3c9",
        "25645b5b-db3c-4a47-87e1-6c238a7a5a37",
      ]
    : ([] as string[]),
  products: reviewing
    ? [
        "8f3685d7-a0fe-40ee-99aa-f36aa1138886",
        "0d8bc651-9a60-4af0-a52f-0920b3810d5e",
      ]
    : ([] as string[]),
  orders: reviewing
    ? [
        "a563342f-9c53-419b-bb8b-fc0b7ebf1119",
        "910a74e6-a12c-4804-90f2-46da9ffe8e7b",
      ]
    : ([] as string[]),
  orderNumbers: reviewing
    ? ["GL-20261016-940DD52C", "GL-20261022-D37DCB95"]
    : ([] as string[]),
};
