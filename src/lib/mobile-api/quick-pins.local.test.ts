// Disposable local PostgreSQL ONLY (#479 increment A), never a remote project. Skipped without the container variable.
// A bare Supabase Postgres image is enough: it has the anon/authenticated roles, auth.users, auth.uid() and pgcrypto in
// «extensions». The test adds the minimum the migration reads (saved_meals with its owner RLS, the idempotency ledger as in
// 20260927190000, a saved-meals reader) and then applies 20261111150000_mobile_quick_pins_expand.sql verbatim.
//   docker run -d --rm --name ownlevel-479-pg-$(openssl rand -hex 4) -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.11.0.006
//   OWNLEVEL_QUICK_PINS_LOCAL_DB=<that name> npx vitest run src/lib/mobile-api/quick-pins.local.test.ts
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { parseQuickPinsConflict, parseQuickPinsSnapshot } from "./nutrition-quick-contract";
import { buildQuickOptions } from "./nutrition-quick-server";

vi.mock("server-only", () => ({}));

const container = process.env.OWNLEVEL_QUICK_PINS_LOCAL_DB;
const migration = join(process.cwd(), "supabase/migrations/20261111150000_mobile_quick_pins_expand.sql");
const psql = ["exec", "-i", container ?? "", "psql", "-X", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"];
const sql = (input: string) => {
  const run = spawnSync("docker", psql, { input, encoding: "utf8", maxBuffer: 1 << 24 });
  if (run.status !== 0) throw Error(run.stderr || run.stdout);
  return run.stdout.trim();
};
const sqlAsync = (input: string) => new Promise<string>((resolve, reject) => {
  const child = spawn("docker", psql); let out = "", err = "";
  child.stdout.on("data", d => { out += d; }); child.stderr.on("data", d => { err += d; });
  child.on("close", code => code === 0 ? resolve(out.trim()) : reject(Error(err || out)));
  child.stdin.end(input);
});
const as = (user: string, statement: string) => `begin; set local role authenticated; set local "request.jwt.claim.sub" = '${user}';\n${statement}\ncommit;`;
const array = (ids: string[]) => `array[${ids.map(id => `'${id}'`).join(",")}]::uuid[]`;
const putSql = (ids: string[], revision: number, key: string) =>
  `select response_status || '|' || replayed || '|' || response_body::text from public.mobile_put_quick_pins(${array(ids)}, ${revision}, '${key}');`;
const parseRow = (line: string) => { const [status, replayed, ...body] = line.split("|"); return { status: Number(status), replayed: replayed === "true", body: JSON.parse(body.join("|")) }; };
const put = (user: string, ids: string[], revision: number, key: string = randomUUID()) => parseRow(sql(as(user, putSql(ids, revision, key))));
// What the GET returns: the RPC output through the same server builder.
const read = (user: string) => buildQuickOptions(JSON.parse(sql(as(user, "select public.mobile_read_quick_options()::text;"))));
const pinsOf = (user: string) => read(user)?.pins;
const refused = (fn: () => unknown) => { try { fn(); } catch (error) { return String((error as Error).message); } return "no error"; };

describe.runIf(!!container)("#479 mobile_quick_pins con PostgreSQL real", () => {
  const owner = randomUUID(), other = randomUUID(), fresh = randomUUID();
  const meals = Array.from({ length: 8 }, () => randomUUID()), foreign = randomUUID();
  const savedState = () => sql(`select string_agg(id || ':' || is_active || ':' || updated_at, ',' order by id) from public.saved_meals;`);

  beforeAll(() => {
    if (!/^ownlevel-479-pg-[a-f0-9]{8}$/.test(container!)) throw Error("Refuse a non-disposable container");
    expect(sql("select to_regprocedure('auth.uid()') is not null and to_regclass('auth.users') is not null;")).toBe("t");
    if (sql("select to_regclass('public.mobile_quick_pins') is not null;") === "f") {
      // The objects the migration depends on, as in production (subset of columns that the reads and writes use).
      sql(`
        create table public.saved_meals (
          id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
          name text not null, description text, template_type text not null default 'manual', calories integer,
          protein_g numeric(10,2), carbs_g numeric(10,2), fat_g numeric(10,2), is_active boolean not null default true,
          created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (id, user_id));
        alter table public.saved_meals enable row level security;
        grant select, insert, update, delete on public.saved_meals to authenticated;
        create policy saved_meals_select_own on public.saved_meals for select to authenticated using ((select auth.uid()) = user_id);
        create policy saved_meals_update_own on public.saved_meals for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
        ${readFileSync(join(process.cwd(), "supabase/migrations/20260927190000_mobile_training_api_expand.sql"), "utf8").match(/create table public\.mobile_idempotency_keys \([\s\S]*?\n\);/)![0]}
        alter table public.mobile_idempotency_keys enable row level security;
        revoke all on table public.mobile_idempotency_keys from public, anon, authenticated;
        -- Stand-in for the real reader (same shape for what Rápido parses); meal_entries is absent, so «suggested» is unavailable.
        create function public.mobile_read_saved_meals() returns jsonb language sql stable security invoker set search_path = '' as $$
          select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('version', repeat('a', 64), 'items', '[]'::jsonb) order by s.name), '[]'::jsonb)
          from public.saved_meals s where s.user_id = (select auth.uid()) $$;
        grant execute on function public.mobile_read_saved_meals() to authenticated;
        -- The read exists in production with these grants (20261004010134); CREATE OR REPLACE keeps them.
        create function public.mobile_read_quick_options() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
        revoke all on function public.mobile_read_quick_options() from public, anon;
        grant execute on function public.mobile_read_quick_options() to authenticated;`);
      sql(readFileSync(migration, "utf8"));
    }
    sql(`insert into auth.users(id) values ('${owner}'), ('${other}'), ('${fresh}');
      insert into public.saved_meals(id, user_id, name, calories) select id, '${owner}', 'COMIDA ' || n, 100 * n
        from unnest(${array(meals)}) with ordinality as m(id, n);
      insert into public.saved_meals(id, user_id, name, calories) values ('${foreign}', '${other}', 'AJENA', 50);`);
  });

  it("a new account reads «ok, revision 0, no pins», and the saved meals stay independent of the pins", () => {
    expect(pinsOf(fresh)).toEqual({ status: "ok", revision: 0, items: [] });
    expect(sql(`select count(*) from public.mobile_quick_pins where user_id = '${fresh}';`)).toBe("0");
    // «suggested» fails in this database (no meal_entries) and pins still answer: one section never hides another.
    expect(read(owner)).toMatchObject({ saved: { status: "ok" }, suggested: { status: "unavailable" }, pins: { status: "ok", revision: 0 } });
  });

  it("0 and 6 pins are written in order; a seventh, a repeat, a null or a bad key is refused before anything is written", () => {
    const before = savedState();
    const six = put(owner, meals.slice(0, 6), 0);
    expect(six).toMatchObject({ status: 200, replayed: false });
    expect(parseQuickPinsSnapshot(six.body)).toEqual({ revision: 1, items: meals.slice(0, 6).map(id => ({ id, state: "active" })) });
    expect(pinsOf(owner)).toEqual({ status: "ok", ...six.body });
    for (const statement of [putSql(meals.slice(0, 7), 1, "k7"), putSql([meals[0], meals[0]], 1, "kd"), `select * from public.mobile_put_quick_pins(array[null]::uuid[], 1, 'kn');`,
      putSql([meals[0]], 1, "bad key"), putSql([meals[0]], -1, "kr")]) {
      expect(refused(() => sql(as(owner, statement)))).toContain("Revisá las comidas fijadas.");
    }
    const none = put(owner, [], 1);
    expect(none.body).toEqual({ revision: 2, items: [] });
    expect(pinsOf(owner)).toEqual({ status: "ok", revision: 2, items: [] });
    // The table itself refuses 7 or a repeat, even for a privileged writer.
    expect(refused(() => sql(`update public.mobile_quick_pins set saved_meal_ids = ${array(meals.slice(0, 7))} where user_id = '${owner}';`))).toContain("mobile_quick_pins_count");
    expect(refused(() => sql(`update public.mobile_quick_pins set saved_meal_ids = ${array([meals[0], meals[0]])} where user_id = '${owner}';`))).toContain("mobile_quick_pins_distinct");
    // Pinning never touches a saved meal.
    expect(savedState()).toBe(before);
  });

  it("no effective change keeps the revision and the row; an empty list on a new account creates no row", () => {
    const stamp = sql(`select updated_at from public.mobile_quick_pins where user_id = '${owner}';`);
    expect(put(owner, [], 2).body).toEqual({ revision: 2, items: [] });
    expect(sql(`select revision || '|' || updated_at from public.mobile_quick_pins where user_id = '${owner}';`)).toBe(`2|${stamp}`);
    expect(put(fresh, [], 0).body).toEqual({ revision: 0, items: [] });
    expect(sql(`select count(*) from public.mobile_quick_pins where user_id = '${fresh}';`)).toBe("0");
  });

  it("a stale revision from a second device is a conflict with server truth, and nothing changes", () => {
    const first = put(owner, [meals[0], meals[1]], 2);
    expect(first.body.revision).toBe(3);
    const stale = put(owner, [meals[2]], 2);
    expect(stale.status).toBe(409);
    expect(parseQuickPinsConflict(stale.body)).toEqual({ error: "QUICK_PINS_CHANGED", message: expect.any(String), current: first.body });
    expect(pinsOf(owner)).toEqual({ status: "ok", ...first.body });
  });

  it("two first writes at the same time on an account without a row: one wins, the other is a conflict, never a lost update", async () => {
    const racer = randomUUID();
    sql(`insert into auth.users(id) values ('${racer}');
      insert into public.saved_meals(id, user_id, name) values ('${meals[6]}', '${racer}', 'A') on conflict do nothing;`);
    const mine = randomUUID(), theirs = randomUUID();
    sql(`insert into public.saved_meals(id, user_id, name) values ('${mine}', '${racer}', 'MÍA'), ('${theirs}', '${racer}', 'OTRA');`);
    // The first holds its transaction open after writing; the second arrives meanwhile with the same expected revision 0.
    const slow = sqlAsync(as(racer, `${putSql([mine], 0, "race-a")}\nselect pg_sleep(1.5);`));
    await new Promise(resolve => setTimeout(resolve, 400));
    const fast = sqlAsync(as(racer, putSql([theirs], 0, "race-b")));
    const [a, b] = (await Promise.all([slow, fast])).map(out => parseRow(out.split("\n")[0]!));
    expect(a).toMatchObject({ status: 200, body: { revision: 1, items: [{ id: mine, state: "active" }] } });
    expect(b.status).toBe(409); expect(b.body).toMatchObject({ error: "QUICK_PINS_CHANGED", current: { revision: 1, items: [{ id: mine }] } });
    expect(sql(`select revision || '|' || saved_meal_ids::text from public.mobile_quick_pins where user_id = '${racer}';`)).toBe(`1|{${mine}}`);
  });

  it("the same key replays the same receipt without writing again; reusing it for other pins is refused; a refusal is not stored", () => {
    const key = "replay:" + randomUUID();
    const done = put(owner, [meals[1], meals[0]], 3, key);
    expect(done).toMatchObject({ status: 200, replayed: false, body: { revision: 4 } });
    const again = put(owner, [meals[1], meals[0]], 3, key);
    expect(again).toEqual({ ...done, replayed: true });
    expect(sql(`select revision from public.mobile_quick_pins where user_id = '${owner}';`)).toBe("4");
    expect(put(owner, [meals[2]], 3, key).body).toEqual({ error: "IDEMPOTENCY_KEY_REUSED", message: expect.any(String), current: null });
    expect(sql(`select count(*) || '|' || min(resource_type) from public.mobile_idempotency_keys where user_id = '${owner}' and idempotency_key = '${key}';`)).toBe("1|quick-pins");
    const conflictKey = "conflict:" + randomUUID();
    expect(put(owner, [meals[2]], 0, conflictKey).status).toBe(409);
    expect(sql(`select count(*) from public.mobile_idempotency_keys where idempotency_key = '${conflictKey}';`)).toBe("0");
    expect(put(owner, [meals[1], meals[0], meals[2]], 4, conflictKey).body.revision).toBe(5);
  });

  it("archived and deleted pins keep their place until released; only active saved meals of the caller can be pinned anew", () => {
    // Now: meals[1], meals[0], meals[2] at revision 5. Archive meals[0], delete meals[2].
    sql(`update public.saved_meals set is_active = false where id = '${meals[0]}'; delete from public.saved_meals where id = '${meals[2]}';`);
    expect(pinsOf(owner)).toEqual({ status: "ok", revision: 5, items: [{ id: meals[1], state: "active" }, { id: meals[0], state: "archived" }, { id: meals[2], state: "deleted" }] });
    const saved = read(owner)!.saved;
    expect(saved.status === "ok" && saved.items.some(item => item.source.id === meals[0])).toBe(false);
    // Reordering keeps unavailable ids; they still count towards the six.
    expect(put(owner, [meals[2], meals[0], meals[1]], 5).body.revision).toBe(6);
    expect(put(owner, [meals[2], meals[0], meals[1], meals[3], meals[4], meals[5]], 6).body.revision).toBe(7);
    expect(refused(() => sql(as(owner, putSql([meals[2], meals[0], meals[1], meals[3], meals[4], meals[5], meals[7]], 7, "seventh"))))).toContain("Revisá las comidas fijadas.");
    // Released explicitly, an archived or deleted meal cannot come back as a new pin; a foreign or unknown id reads the same.
    expect(put(owner, [meals[1]], 7).body.revision).toBe(8);
    for (const candidate of [meals[0], meals[2], foreign, randomUUID()]) {
      const refusal = put(owner, [meals[1], candidate], 8);
      expect(refusal.status).toBe(409);
      expect(refusal.body).toEqual({ error: "QUICK_PIN_UNAVAILABLE", message: expect.any(String), current: { revision: 8, items: [{ id: meals[1], state: "active" }] } });
    }
    // Restoring brings it back to what can be pinned (and a pinned archived one shows as active again).
    sql(`update public.saved_meals set is_active = true where id = '${meals[0]}';`);
    expect(put(owner, [meals[1], meals[0]], 8).body).toEqual({ revision: 9, items: [{ id: meals[1], state: "active" }, { id: meals[0], state: "active" }] });
  });

  it("isolation: a person sees and writes only their own pins; nobody writes the table directly; anon has no access", () => {
    put(other, [foreign], 0);
    expect(sql(as(owner, `select count(*) from public.mobile_quick_pins;`))).toBe("1");
    expect(sql(as(other, `select string_agg(user_id::text, ',') from public.mobile_quick_pins;`))).toBe(other);
    expect(pinsOf(other)).toEqual({ status: "ok", revision: 1, items: [{ id: foreign, state: "active" }] });
    for (const statement of [`insert into public.mobile_quick_pins values ('${owner}', '{}', 1, now());`, `update public.mobile_quick_pins set revision = 99;`,
      `delete from public.mobile_quick_pins;`]) {
      expect(refused(() => sql(as(owner, statement)))).toMatch(/permission denied/);
    }
    // The private writer is executable (the public wrapper is security invoker, as for progress views) but it is the same
    // guarded function: identity from the token, CAS on the caller's own revision. PostgREST does not expose that schema.
    expect(parseRow(sql(as(owner, `select response_status || '|' || replayed || '|' || response_body::text from ownlevel_private.put_quick_pins('{}'::uuid[], 0, 'direct');`))))
      .toMatchObject({ status: 409, body: { error: "QUICK_PINS_CHANGED", current: { revision: 9 } } });
    expect(refused(() => sql(as(other, `select ownlevel_private.distinct_uuid_array('{}'::uuid[]);`)))).toMatch(/permission denied/);
    for (const statement of [`select * from public.mobile_quick_pins;`, putSql([], 0, "anon"), `select public.mobile_read_quick_options();`]) {
      expect(refused(() => sql(`begin; set local role anon; ${statement} commit;`))).toMatch(/permission denied/);
    }
    // Without a token the function refuses before reading anything.
    expect(refused(() => sql(`begin; set local role authenticated; ${putSql([], 0, "no-user")} commit;`))).toContain("UNAUTHORIZED");
    expect(sql(`select count(*) from public.mobile_quick_pins where user_id = '${owner}' and revision = 9;`)).toBe("1");
  });

  it("a failed pins read is «unavailable» while the confirmed saved meals stay", () => {
    const out = sql(`begin; revoke select on public.mobile_quick_pins from authenticated;
      set local role authenticated; set local "request.jwt.claim.sub" = '${owner}'; select public.mobile_read_quick_options()::text; rollback;`);
    const options = buildQuickOptions(JSON.parse(out));
    expect(options?.pins).toEqual({ status: "unavailable" });
    expect(options?.saved).toMatchObject({ status: "ok" });
  });

  it("deleting the account removes the pins with the person (cascade from auth.users, as ownlevel_private.delete_account relies on)", () => {
    expect(sql(`select count(*) from public.mobile_quick_pins where user_id = '${other}';`)).toBe("1");
    sql(`delete from public.saved_meals where user_id = '${other}'; delete from auth.users where id = '${other}';`);
    expect(sql(`select count(*) from public.mobile_quick_pins where user_id = '${other}';`)).toBe("0");
    expect(sql(`select count(*) from public.mobile_quick_pins where user_id = '${owner}';`)).toBe("1");
  });
});
