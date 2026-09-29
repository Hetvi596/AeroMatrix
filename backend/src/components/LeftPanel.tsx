import { useTwin } from '../store/useTwinStore';
import { AirQualitySection, GreenSection, IndustriesSection, OverviewSection, TrafficSection, ZonesSection } from './sections';
import { WhatIfPanel } from '../simulator/WhatIfPanel';
import { ScenariosPanel } from '../scenarios/ScenariosPanel';
import { ActionsPanel } from '../scenarios/ActionsPanel';
import { LocationsPanel } from '../scenarios/LocationsPanel';
import { AnalyticsPanel } from '../analytics/AnalyticsPanel';
import { DataPanel } from './DataPanel';

export function LeftPanel() {
  const section = useTwin((s) => s.section);
  switch (section) {
    case 'overview':
      return <OverviewSection />;
    case 'air':
      return <AirQualitySection />;
    case 'zones':
      return <ZonesSection />;
    case 'traffic':
      return <TrafficSection />;
    case 'industries':
      return <IndustriesSection />;
    case 'green':
      return <GreenSection />;
    case 'simulator':
      return <WhatIfPanel />;
    case 'scenarios':
      return <ScenariosPanel />;
    case 'actions':
      return <ActionsPanel />;
    case 'locations':
      return <LocationsPanel />;
    case 'analytics':
      return <AnalyticsPanel />;
    case 'data':
      return <DataPanel />;
  }
}
