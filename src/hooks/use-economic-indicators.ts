import { useEffect, useState } from 'react';
import { loadMarketRates, type MarketRates } from '../services/market-rates';
import { loadMarketExpectations, type MarketExpectations } from '../services/market-expectations';
import { loadInflationHistory, type InflationHistory } from '../services/inflation-indicators';

export function useEconomicIndicators() {
  const [rates, setRates] = useState<MarketRates>({});
  const [focus, setFocus] = useState<MarketExpectations>({ source: 'Expectativa Focus · Banco Central' });
  const [inflation, setInflation] = useState<InflationHistory>();
  useEffect(() => {
    let active = true;
    const load = () => {
      void loadMarketRates().then((v) => { if (active) setRates(v); });
      void loadMarketExpectations().then((v) => { if (active) setFocus(v); });
      void loadInflationHistory().then((v) => { if (active) setInflation(v); });
    };
    load();
    window.addEventListener('online', load);
    return () => { active = false; window.removeEventListener('online', load); };
  }, []);
  return { rates, focus, inflation };
}
export type EconomicIndicators = ReturnType<typeof useEconomicIndicators>;
