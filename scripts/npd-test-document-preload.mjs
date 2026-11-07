// NODE_OPTIONS preload for the isolated localhost test server only.
if (
  !/^postgres(?:ql)?:\/\/[^/]*@?(?:127\.0\.0\.1|localhost):55439\/roota_npd_helper_preview$/.test(
    process.env.DATABASE_URL ?? "",
  )
)
  throw Error("LOCAL_TEST_DATABASE_REQUIRED");
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const match =
    /^https:\/\/lknpd\.nalog\.ru\/api\/v1\/receipt\/773212983545\/roota-helper-local-fixture-([a-f0-9-]{36})\/print$/.exec(
      String(input),
    );
  return match
    ? original("http://127.0.0.1:3161/document/" + match[1], {
        signal: init?.signal,
      })
    : original(input, init);
};
