import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { AppText, Heading } from "@/design-system";
import {
  EditorialRow,
  EditorialScreen,
  formatNumber,
} from "@/settings/editorial";
import { shortDate } from "@/settings/settings-model";
import { kindLabel, templates, weekdayFor } from "./stages-model";
import {
  isLocked,
  RefreshingStages,
  StagesSkeleton,
  StagesStatus,
  useStageColor,
  useStagesRoute,
} from "./stages-ui";
export function StageActionScreen() {
  const shared = useStagesRoute();
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string }>();
  const color = useStageColor();
  const list = shared?.state.list;
  const source = params.source
    ? list?.past.find((s) => s.id === params.source)
    : undefined;
  const disabled =
    !shared || isLocked(shared.state) || (!!params.source && !source);
  const kcal = list?.current?.weekdays.find(
    (d) => d.weekday === weekdayFor(list.today),
  )?.calorieTargetKcal;
  return (
    <EditorialScreen>
      <AppText muted variant="caption">
        TU PLAN
      </AppText>
      <Heading>¿Qué querés hacer ahora?</Heading>
      {shared ? <RefreshingStages state={shared.state} /> : null}
      {!list ? (
        <StagesSkeleton />
      ) : (
        <>
          <AppText muted>
            {list.current
              ? `Ahora: ${kindLabel(list.current.kind)}${kcal == null ? "" : ` · ${formatNumber(kcal)} kcal`} · desde ${shortDate(list.current.startsOn)}`
              : "Todavía no tenés una etapa en curso."}
          </AppText>
          {source ? (
            <AppText muted>
              Vas a partir de «{source.name}». La etapa pasada queda igual.
            </AppText>
          ) : params.source ? (
            <AppText>No pudimos encontrar esa etapa para duplicarla.</AppText>
          ) : null}
          <View>
            <EditorialRow
              large
              title="Cambiar desde hoy"
              disabled={disabled}
              onPress={() => {
                if (shared?.controller.replace(source))
                  router.push("/settings/stage-plan");
              }}
            >
              Reemplaza tu plan actual. Sigue hasta que lo cambies.
            </EditorialRow>
            <EditorialRow
              large
              title="Programar etapas"
              disabled={disabled}
              onPress={() => {
                if (shared?.controller.sequence(undefined, source))
                  router.push("/settings/stage-sequence");
              }}
            >
              Armá una secuencia con fechas encadenadas.
            </EditorialRow>
          </View>
          <AppText muted variant="caption">
            PLANES TÍPICOS
          </AppText>
          {templates.map((template, i) => (
            <View key={template.name} style={{ gap: 8 }}>
              <EditorialRow
                title={template.name}
                disabled={disabled}
                onPress={() => {
                  if (shared?.controller.sequence(i))
                    router.push("/settings/stage-sequence");
                }}
              >{`${template.stages.reduce((total, s) => total + s.value, 0)} meses`}</EditorialRow>
              <View
                accessible={false}
                style={{ flexDirection: "row", gap: 4, height: 8 }}
              >
                {template.stages.map(({ kind, value: months }, n) => (
                  <View
                    key={n}
                    style={{
                      flex: months,
                      backgroundColor: color(kind),
                      borderRadius: 4,
                    }}
                  />
                ))}
              </View>
              <AppText muted variant="footnote">
                {template.stages
                  .map(
                    (s) =>
                      `${s.value} ${s.value === 1 ? "mes" : "meses"} ${kindLabel(s.kind).toLocaleLowerCase("es-AR")}`,
                  )
                  .join(" · ")}
              </AppText>
            </View>
          ))}
        </>
      )}
      {shared ? <StagesStatus {...shared} /> : null}
    </EditorialScreen>
  );
}
