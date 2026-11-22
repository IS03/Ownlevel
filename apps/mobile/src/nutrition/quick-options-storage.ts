import { parseQuickOptions, type QuickOptions } from '@/api/nutrition-quick';
import { parsePersonalFood, type PersonalFood } from '@/api/nutrition-food';
import type { NutritionStoragePort } from './intent-repository';
import { DeviceCopy } from './device-copy';

export const quickOptionsStorageKey = (userId: string) => `ownlevel.nutrition.quick-options.v1.${encodeURIComponent(userId)}`;
export const plateFoodsStorageKey = (userId: string) => `ownlevel.nutrition.plate-foods.v1.${encodeURIComponent(userId)}`;
/** Rápido's (and Plato's saved meals) last complete quick-options answer. */
export class QuickOptionsSnapshot extends DeviceCopy<QuickOptions> {
  constructor(port: NutritionStoragePort, userId: string) { super(port, quickOptionsStorageKey(userId), parseQuickOptions); }
}
/** Plato's last list of active foods. Any food that does not parse drops the whole copy (never a partial list). */
export class PlateFoodsSnapshot extends DeviceCopy<PersonalFood[]> {
  constructor(port: NutritionStoragePort, userId: string) {
    super(port, plateFoodsStorageKey(userId), value => {
      if (!Array.isArray(value)) return undefined;
      const foods = value.map(parsePersonalFood);
      return foods.every((f): f is PersonalFood => !!f) ? foods : undefined;
    });
  }
}
