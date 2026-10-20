import { describe, expect, it } from "@jest/globals";
import {
  addDuration,
  applyDays,
  chooseKind,
  draftNumber,
  repeatedDay,
  scheduledCollision,
  sequenceDates,
  sequenceDraft,
  stageDraft,
  stageFields,
  hasProteinGoal,
  suggestedKind,
  validSequence,
  kindLabel,
} from "./stages-model";
import { stagesFixture } from "./stages-fixture.test-helper";
import { previousDate, stageProgress } from "@/settings/settings-model";
describe("Calendar and honest plan drafts", () => {
  it.each([
    ["2027-01-31", 1, "2027-02-28"],
    ["2028-01-31", 1, "2028-02-29"],
    ["2026-12-31", 2, "2027-02-28"],
    ["2026-10-16", 3, "2027-01-16"],
  ])(
    "calendar months clamp from each stage: %s + %s",
    (date, value, expected) => {
      expect(
        addDuration(String(date), { unit: "months", value: Number(value) }),
      ).toBe(expected);
    },
  );
  it("chains adjusted month ends and seven-day weeks, and presents inclusive last days", () => {
    const sequence = sequenceDraft(stagesFixture(), 0);
    sequence.startDate = "2027-01-31";
    sequence.stages[0].duration = { unit: "months", value: 1 };
    sequence.stages[1].duration = { unit: "months", value: 1 };
    sequence.stages[2].duration = { unit: "weeks", value: 2 };
    expect(sequenceDates(sequence)).toEqual([
      { startsOn: "2027-01-31", endsOn: "2027-02-28" },
      { startsOn: "2027-02-28", endsOn: "2027-03-28" },
      { startsOn: "2027-03-28", endsOn: "2027-04-11" },
    ]);
    expect(previousDate("2027-02-28")).toBe("2027-02-27");
  });
  it("copies protein and real zero extras, with conservative GET suggestions only for calories", () => {
    const list = stagesFixture();
    const draft = stageDraft(list, "surplus");
    expect(draft.weekdays[0]).toMatchObject({ kcal: "2625", protein: "130" });
    expect(draft).toMatchObject({ trainingCalorieDeltaKcal: "300", trainingProteinDeltaG: "20", suggested: true });
    list.current!.trainingCalorieDeltaKcal = 0;
    expect(stageDraft(list).trainingCalorieDeltaKcal).toBe("0");
  });
  it("a saved stage carries no water of its own; the protein extra only exists with a protein goal", () => {
    const draft = stageDraft(stagesFixture(), "deficit");
    expect(stageFields(draft)).toMatchObject({ baseWaterL: null, trainingWaterDeltaL: 0, trainingCalorieDeltaKcal: 300, trainingProteinDeltaG: 20 });
    const noProtein = { ...draft, weekdays: draft.weekdays.map((d) => ({ ...d, protein: "0" })) };
    expect(hasProteinGoal(noProtein)).toBe(false);
    expect(stageFields(noProtein)?.trainingProteinDeltaG).toBe(0);
    expect(stageFields({ ...draft, trainingProteinDeltaG: "" })).toBeUndefined(); // missing is never sent as 0
  });
  it("recomposition and custom start at maintenance and are marked suggested, not a fabricated recommendation", () => {
    for (const kind of ["recomposition", "custom"] as const) {
      const draft = stageDraft(stagesFixture(), kind);
      expect(draft.weekdays[0].kcal).toBe("2500");
      expect(draft.suggested).toBe(true);
    }
  });
  it("without expenditure copies real weekdays; with no plan leaves everything else empty, never zero", () => {
    const list = stagesFixture({ suggestions: false });
    const draft = stageDraft(list, "deficit");
    expect(draft.weekdays[0].kcal).toBe("1900");
    expect(draft.suggested).toBe(false);
    list.current = null;
    const empty = stageDraft(list);
    expect(empty.weekdays[0]).toEqual({ weekday: 1, kcal: "", protein: "" });
    expect(empty.trainingCalorieDeltaKcal).toBe("");
    expect(empty.trainingProteinDeltaG).toBe("");
    expect(draftNumber("")).toBeNull();
    expect(draftNumber("0")).toBe(0);
    expect(stageFields(empty)).toBeUndefined();
  });
  it("old untyped stages keep their exact names and targets; suggested classification never selects itself", () => {
    const list = stagesFixture({ untyped: true });
    const original = stageDraft(list, null, list.current!);
    expect(kindLabel(original.kind)).toBe("Plan");
    expect(suggestedKind(original, list)).toBe("deficit");
    expect(original.kind).toBeNull();
    expect(stageFields(original)).toBeUndefined();
    const selected = chooseKind(original, "recomposition", list);
    expect(stageFields(selected)).toMatchObject({
      kind: "recomposition",
      name: "Déficit de primavera",
      weekdays: list.current!.weekdays,
    });
    expect(selected.name).toBe(original.name);
    expect(original.kind).toBeNull();
  });
  it.each([
    [2375, "maintenance"],
    [2625, "maintenance"],
    [2374, "deficit"],
    [2626, "surplus"],
  ])("type suggestion uses inclusive ±5%% (%s)", (value, kind) => {
    const list = stagesFixture({ untyped: true });
    const draft = stageDraft(list, null, list.current!);
    draft.weekdays.forEach((d) => {
      d.kcal = String(value);
    });
    expect(suggestedKind(draft, list)).toBe(kind);
    expect(draft.kind).toBeNull();
  });
  it("applies only the chosen days and uses the most repeated calorie/protein pair, stable on ties", () => {
    const stage = stageDraft(stagesFixture(), "deficit");
    const changed = applyDays(stage, [6, 7], "2200", "120");
    expect(changed.weekdays[0]).toEqual(stage.weekdays[0]);
    expect(changed.weekdays[5]).toMatchObject({ kcal: "2200", protein: "120" });
    expect(changed.suggested).toBe(false);
    expect(repeatedDay(changed).weekday).toBe(1);
  });
  it("validates limits, no silent overlaps and explicit maintenance objectives", () => {
    const list = stagesFixture();
    const sequence = sequenceDraft(list, 0);
    expect(validSequence(sequence, list)).toBe(true);
    sequence.afterEnd = "maintenance";
    expect(sequence.maintenanceStage.kind).toBe("maintenance");
    expect(sequence.maintenanceStage.weekdays[0].kcal).toBe("2500");
    expect(validSequence(sequence, list)).toBe(true);
    sequence.stages[0].duration.value = 25;
    expect(validSequence(sequence, list)).toBe(false);
    expect(
      scheduledCollision(stagesFixture({ future: true }), "2026-10-16")
        ?.startsOn,
    ).toBe("2026-12-22");
    expect(
      scheduledCollision(stagesFixture({ future: true }), "2026-12-23"),
    ).toBeNull();
  });
  it("shares exactly the Settings progress arithmetic, never gives open stages an invented duration", () => {
    const list = stagesFixture({ future: true });
    expect(stageProgress(list.current!, list.today)).toMatchObject({
      week: 3,
      weeks: 12,
    });
    expect(stageProgress(stagesFixture().current!, list.today)).toBeNull();
  });
});
