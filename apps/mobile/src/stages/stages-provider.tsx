import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import { useMobileApi } from "@/api";
import { useMobileAuth } from "@/auth";
import {
  fetchNutritionStages,
  mutateNutritionStages,
} from "@/api/nutrition-stages";
import { fetchMobileNutritionDay } from "@/api/nutrition-day";
import { shouldRefreshOnForeground } from "@/api/resource";
import { useConfirmExternalPlan } from "@/nutrition/config-provider";
import { StagesController, type StagesState } from "./stages-controller";
import { StagesIntentRepository } from "./stages-storage";
import {
  cachedStages,
  rememberStages,
  subscribeStagesCache,
} from "./stages-cache";
type Value = { controller: StagesController; state: StagesState } | null;
const StagesContext = createContext<Value>(null);
export function NutritionStagesProvider({ children }: PropsWithChildren) {
  const { client } = useMobileApi();
  const { session } = useMobileAuth();
  const userId = session?.user.id ?? null;
  const confirm = useConfirmExternalPlan();
  const [current, setCurrent] = useState<
    (NonNullable<Value> & { userId: string; client: typeof client }) | null
  >(null);
  useEffect(() => {
    if (!client || !userId) return;
    const life = new AbortController();
    const controller = new StagesController(
      {
        read: () => fetchNutritionStages(client, life.signal),
        write: (i) => mutateNutritionStages(client, i, life.signal),
        refreshToday: async (date) =>
          (await fetchMobileNutritionDay(client, date, life.signal)).status ===
          "ok",
      },
      new StagesIntentRepository(AsyncStorage, userId),
      confirm,
      cachedStages(client, userId),
    );
    const publish = () => {
      const state = controller.getSnapshot();
      if (state.list) rememberStages(client, userId, state.list);
      setCurrent({ client, userId, controller, state });
    };
    const unsubscribe = controller.subscribe(publish);
    publish();
    void controller.initialize();
    const unsubscribeCache = subscribeStagesCache(client, userId, (list) =>
      controller.adoptCached(list),
    );
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", (next) => {
      if (
        shouldRefreshOnForeground(previous, next) &&
        controller.getSnapshot().list
      )
        void controller.load();
      previous = next;
    });
    return () => {
      unsubscribe();
      unsubscribeCache();
      subscription.remove();
      controller.dispose();
      life.abort();
    };
  }, [client, userId, confirm]);
  const value =
    current?.client === client && current?.userId === userId ? current : null;
  return (
    <StagesContext.Provider value={value}>{children}</StagesContext.Provider>
  );
}
export function useNutritionStages() {
  return useContext(StagesContext);
}
