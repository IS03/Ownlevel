// Disposable local PostgreSQL ONLY, never a remote project. Skipped without the container variable.
// A bare Supabase Postgres image is enough (anon/authenticated roles, auth.users, auth.uid(), pgcrypto in «extensions»).
// The test adds the idempotency ledger as in 20260927190000 and applies 20261118003108_mobile_meal_moment_bands_expand.sql verbatim.
//   docker run -d --rm --name ownlevel-bands-pg-$(openssl rand -hex 4) -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.11.0.006
//   OWNLEVEL_MOMENT_BANDS_LOCAL_DB=<that name> npx vitest run src/lib/mobile-api/meal-moment-bands.local.test.ts
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseMealMomentBandsConflict, parseMealMomentBandsSnapshot, type MealMomentBands } from "./nutrition-moment-bands-contract";

const container = process.env.OWNLEVEL_MOMENT_BANDS_LOCAL_DB;
const migration = join(process.cwd(), "supabase/migrations/20261118003108_mobile_meal_moment_bands_expand.sql");
const psql = ["exec", "-i", container ?? "", "psql", "-X", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"];
const sql = (input: string) => {
  const run = spawnSync("docker", psql, { input, encoding: "utf8", maxBuffer: 1 << 24 });
  if (run.status !== 0) throw Error(run.stderr || run.stdout);
  return run.stdout.trim();
};
const as = (user: string, statement: string) => `begin; set local role authenticated; set local "request.jwt.claim.sub" = '${user}';\n${statement}\ncommit;`;
const refused = (fn: () => unknown) => { try { fn(); } catch (error) { return String((error as Error).message); } return "no error"; };
const putSql = (b: MealMomentBands, revision: number, key: string) =>
  `select response_status || '|' || replayed || '|' || response_body::text from public.mobile_put_meal_moment_bands(${b.breakfastFrom}::smallint, ${b.lunchFrom}::smallint, ${b.snackFrom}::smallint, ${b.dinnerFrom}::smallint, ${b.dinnerUntil}::smallint, ${revision}, '${key}');`;
const parseRow = (line: string) => { const [status, replayed, ...body] = line.split("|"); return { status: Number(status), replayed: replayed === "true", body: JSON.parse(body.join("|")) }; };
const put = (user: string, b: MealMomentBands, revision: number, key: string = randomUUID()) => parseRow(sql(as(user, putSql(b, revision, key))));
const read = (user: string) => parseMealMomentBandsSnapshot(JSON.parse(sql(as(user, "select public.mobile_read_meal_moment_bands()::text;"))));
const mine: MealMomentBands = { breakfastFrom: 420, lunchFrom: 720, snackFrom: 960, dinnerFrom: 1200, dinnerUntil: 1410 };

describe.runIf(!!container)("mobile_meal_moment_bands con PostgreSQL real", () => {
  const owner = randomUUID(), other = randomUUID(), fresh = randomUUID();
  beforeAll(() => {
    if (!/^ownlevel-bands-pg-[a-f0-9]{8}$/.test(container!)) throw Error("Refuse a non-disposable container");
    if (sql("select to_regclass('public.mobile_meal_moment_bands') is not null;") === "f") {
      sql(`${readFileSync(join(process.cwd(), "supabase/migrations/20260927190000_mobile_training_api_expand.sql"), "utf8").match(/create table public\.mobile_idempotency_keys \([\s\S]*?\n\);/)![0]}
        alter table public.mobile_idempotency_keys enable row level security;
        revoke all on table public.mobile_idempotency_keys from public, anon, authenticated;`);
      sql(readFileSync(migration, "utf8"));
    }
    sql(`insert into auth.users(id) values ('${owner}'), ('${other}'), ('${fresh}');`);
  });

  it("a new account reads revision 0 without bands, and no row exists", () => {
    expect(read(fresh)).toEqual({ revision: 0, bands: null });
    expect(sql(`select count(*) from public.mobile_meal_moment_bands where user_id = '${fresh}';`)).toBe("0");
  });

  it("the first write creates the row at revision 1; an unchanged write keeps it; a change increments it", () => {
    const first = put(owner, mine, 0);
    expect(first).toMatchObject({ status: 200, replayed: false, body: { revision: 1, bands: mine } });
    expect(read(owner)).toEqual({ revision: 1, bands: mine });
    const stamp = sql(`select updated_at from public.mobile_meal_moment_bands where user_id = '${owner}';`);
    expect(put(owner, mine, 1).body).toEqual({ revision: 1, bands: mine });
    expect(sql(`select revision || '|' || updated_at from public.mobile_meal_moment_bands where user_id = '${owner}';`)).toBe(`1|${stamp}`);
    expect(put(owner, { ...mine, lunchFrom: 750 }, 1).body).toEqual({ revision: 2, bands: { ...mine, lunchFrom: 750 } });
  });

  it("a stale revision is a conflict with the server truth, and nothing changes", () => {
    const stale = put(owner, { ...mine, snackFrom: 990 }, 1);
    expect(stale.status).toBe(409);
    expect(parseMealMomentBandsConflict(stale.body)).toEqual({ error: "MEAL_MOMENT_BANDS_CHANGED", message: "Tus horarios cambiaron en otro dispositivo.", current: { revision: 2, bands: { ...mine, lunchFrom: 750 } } });
    expect(read(owner)).toEqual({ revision: 2, bands: { ...mine, lunchFrom: 750 } });
  });

  it("the same key replays the stored receipt; reused with other bands it is refused and writes nothing", () => {
    const key = randomUUID();
    const done = put(owner, mine, 2, key);
    expect(done.body).toEqual({ revision: 3, bands: mine });
    expect(put(owner, mine, 2, key)).toMatchObject({ status: 200, replayed: true, body: { revision: 3, bands: mine } });
    expect(put(owner, { ...mine, dinnerFrom: 1230 }, 2, key)).toMatchObject({ status: 409, body: { error: "IDEMPOTENCY_KEY_REUSED", current: null } });
    expect(read(owner)).toEqual({ revision: 3, bands: mine });
    expect(sql(`select count(*) || '|' || min(resource_type) from public.mobile_idempotency_keys where user_id = '${owner}' and idempotency_key = '${key}';`)).toBe("1|meal-moment-bands");
  });

  it("out of order, off the grid, past midnight, a bad key or revision is refused before anything is written", () => {
    for (const statement of [putSql({ ...mine, lunchFrom: 400 }, 3, "a"), putSql({ ...mine, lunchFrom: 725 }, 3, "b"), putSql({ ...mine, dinnerUntil: 1455 }, 3, "c"),
      putSql({ ...mine, breakfastFrom: -15 }, 3, "d"), putSql(mine, 3, "bad key"), putSql(mine, -1, "e")]) {
      expect(refused(() => sql(as(owner, statement)))).toContain("Revisá los horarios de las comidas.");
    }
    expect(read(owner)).toEqual({ revision: 3, bands: mine });
    // The table refuses it too, even for a privileged writer.
    expect(refused(() => sql(`update public.mobile_meal_moment_bands set lunch_from = 405 where user_id = '${owner}';`))).toContain("mobile_meal_moment_bands_order");
  });

  it("each person reads and writes only their own bands; the table is not writable and anon cannot call anything", () => {
    expect(read(other)).toEqual({ revision: 0, bands: null });
    expect(put(other, { ...mine, breakfastFrom: 360 }, 0).body.revision).toBe(1);
    expect(read(owner)).toEqual({ revision: 3, bands: mine });
    expect(sql(as(other, `select count(*) from public.mobile_meal_moment_bands;`))).toBe("1");
    expect(refused(() => sql(as(owner, `update public.mobile_meal_moment_bands set lunch_from = 780;`)))).toContain("permission denied");
    expect(refused(() => sql(as(owner, `insert into public.mobile_meal_moment_bands(user_id, breakfast_from, lunch_from, snack_from, dinner_from, dinner_until, revision) values ('${fresh}', 0, 15, 30, 45, 60, 1);`)))).toContain("permission denied");
    expect(refused(() => sql(`begin; set local role anon; select public.mobile_read_meal_moment_bands(); commit;`))).toContain("permission denied");
    expect(refused(() => sql(`begin; set local role anon; ${putSql(mine, 0, "anon")} commit;`))).toContain("permission denied");
    expect(refused(() => sql(`begin; set local role authenticated; select public.mobile_read_meal_moment_bands(); commit;`))).toContain("UNAUTHORIZED");
  });

  it("deleting the account removes the preference", () => {
    sql(`delete from auth.users where id = '${other}';`);
    expect(sql(`select count(*) from public.mobile_meal_moment_bands where user_id = '${other}';`)).toBe("0");
  });
});
