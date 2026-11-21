/** Same entries as Nutrición's "Agregar comida": each one opens that existing loading flow. */
export type HomeAddMenuProps = {
  onFood: () => void;
  onManual: () => void;
  onQuick: () => void;
  /** «Plato»: several foods by quantity as one meal. */
  onPlate: () => void;
};
