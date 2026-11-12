import type { MeasureKey } from './body-measure-layout';

// "Cómo medir" guides for the measurement editor (#470): short text only, no illustrations.
//
// PENDING EDITORIAL / ANATOMICAL REVIEW: the wording below is a practical orientation for taking a tape measurement
// at home, not medical or professional advice, and it has not been reviewed yet. Nothing here changes how a stored
// measurement is read or interpreted.

export type MeasureGuide = { title: string; steps: string[] };

export const GUIDE_COMMON = 'Cinta horizontal, sin apretar ni hundir la piel, y repetí en condiciones parecidas: misma hora y misma postura.';

export const MEASURE_GUIDES: Record<MeasureKey, MeasureGuide> = {
  waist: {
    title: 'Cintura',
    steps: ['Punto más angosto del torso, a mitad de camino entre la última costilla y el hueso de la cadera.', 'Medí al final de una exhalación normal.'],
  },
  abdomen: {
    title: 'Abdomen',
    steps: ['A la altura del ombligo, con el abdomen relajado.'],
  },
  chest: {
    title: 'Pecho',
    steps: ['Alrededor del pecho, a la altura de los pezones y por debajo de las axilas.', 'Brazos relajados a los costados.'],
  },
  hip: {
    title: 'Cadera',
    steps: ['En la parte más ancha de los glúteos.', 'Pies juntos y cinta paralela al piso.'],
  },
  arm: {
    title: 'Brazo',
    steps: ['Brazo relajado al costado, en el punto medio entre el hombro y el codo.', 'Medí cada lado por separado.'],
  },
  thigh: {
    title: 'Muslo',
    steps: ['De pie, con el peso repartido.', 'En la parte más ancha del muslo, justo debajo del pliegue del glúteo.', 'Medí cada lado por separado.'],
  },
  calf: {
    title: 'Pantorrilla',
    steps: ['De pie, con el peso repartido.', 'En la parte más ancha de la pantorrilla.', 'Medí cada lado por separado.'],
  },
};
