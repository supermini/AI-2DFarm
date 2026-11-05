// The phone as the 3D office mounts it: the plain Phone plus the two things only the office has, the holiday strip and
// the Games tab. Phone.tsx itself imports nothing from world/ (pocket mode and the 2D dashboard use it without these).
import type { PhoneTab } from '../store';
import { Phone } from './Phone';
import { HolidayStrip } from './HolidayStrip';
import { Games } from './games/Games';

const strip = <HolidayStrip />;

export function Phone3D({ tab, requestId }: { tab?: PhoneTab; requestId?: string }) {
  return <Phone tab={tab} requestId={requestId} strip={strip} games={Games} />;
}
