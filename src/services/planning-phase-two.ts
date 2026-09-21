import type { Data } from '../model';
import { calculateBudgets, monthContext, projectSpending } from './budget';
import { calculateCostOfLiving } from './cost-of-living';
import { calculateDynamicTarget } from './dynamic-target';
import { calculateEmergencyFund } from './emergency-fund';
import { getCashFlowForecast } from './cash-flow';
export function planningPhaseTwo(d: Data, at: string) {
  const ctx = monthContext(at),
    forecast = getCashFlowForecast(d, at, ctx.days - ctx.day);
  const spending = projectSpending(d, at, forecast),
    living = calculateCostOfLiving(d, at, undefined, forecast);
  return {
    budget: calculateBudgets(d, spending),
    living,
    reserve: calculateEmergencyFund(d, at, living),
    target: calculateDynamicTarget(d, at, spending, forecast),
  };
}
