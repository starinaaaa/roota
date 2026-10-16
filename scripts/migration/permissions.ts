import { pool, required, guardTarget } from "./common";
const db = pool("TARGET_DATABASE_URL");
try {
  await guardTarget(db, false);
  await db.query("BEGIN");
  const role = (
    await db.query(
      "select rolsuper,rolcreatedb,rolcreaterole,rolbypassrls from pg_roles where rolname='roota_app'",
    )
  ).rows[0];
  if (role) {
    if (Object.values(role).some(Boolean)) throw Error("UNSAFE_RUNTIME_ROLE");
    if (
      (
        await db.query(
          "select exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname='roota_app') present",
        )
      ).rows[0].present
    )
      throw Error("RUNTIME_ROLE_HAS_MEMBERSHIPS");
    // A user created by the owner in the Timeweb panel is reused. Its password
    // is never rotated by the migration or sent to the SQL server as a query.
  } else {
    const password = required("RUNTIME_DATABASE_PASSWORD");
    if (password.length < 24) throw Error("USE_RANDOM_RUNTIME_PASSWORD");
    const escaped = (
      await db.query("select quote_literal($1) value", [password])
    ).rows[0].value;
    await db.query(
      `create role roota_app login password ${escaped} nosuperuser nocreatedb nocreaterole noinherit nobypassrls`,
    );
  }
  // Timeweb's user form can replace object ACLs, omitting the owner. FK checks
  // execute as the referenced table owner and still need its explicit SELECT.
  await db.query(`grant all privileges on all tables in schema public to current_user;
    grant all privileges on all sequences in schema public to current_user;
    revoke create on schema public from public,roota_app;
    grant usage on schema public to roota_app;
    grant select,insert,update,delete on all tables in schema public to roota_app;
    grant usage,select on all sequences in schema public to roota_app;
    grant execute on all functions in schema public to roota_app;`);
  await db.query("COMMIT");
  console.log(
    "Runtime grants ready; configure DATABASE_URL securely with roota_app.",
  );
} catch {
  await db.query("ROLLBACK");
  throw new Error("RUNTIME_ROLE_SETUP_FAILED");
} finally {
  await db.end();
}
