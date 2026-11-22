import type { ModuleDef } from "./types.js";
import { cardsModule } from "./cards/index.js";
import { depositsModule } from "./deposits/index.js";
import { insuranceModule } from "./insurance/index.js";
import { investmentsModule } from "./investments/index.js";
import { loansModule } from "./loans/index.js";

export type { AttentionItem, ModuleDef } from "./types.js";

/** Built-in modules, in the order their items and nav entries appear. */
export const MODULES: ModuleDef[] = [cardsModule, loansModule, depositsModule, investmentsModule, insuranceModule];

export function moduleByName(name: string): ModuleDef | undefined {
  return MODULES.find((m) => m.name === name);
}
