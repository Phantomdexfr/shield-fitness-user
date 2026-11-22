// Phase 86 guard: the declutter I screens keep their sections collapsible and Today keeps its one-slot layout.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = (p: string) => readFileSync(p, 'utf8');
const SECTIONED = [
  'src/pages/session/TrainPage.tsx',
  'src/pages/session/SessionPage.tsx',
  'src/pages/routines/RoutineWeekPage.tsx',
  'src/pages/routines/RoutineDayPage.tsx',
  'src/pages/routines/QuickWorkoutPage.tsx',
  'src/pages/history/SessionViewPage.tsx',
  'src/pages/history/HistoryPage.tsx',
];

describe('Phase 86 declutter I', () => {
  it.each(SECTIONED)('%s uses Collapsible sections', (p) => {
    expect(src(p)).toContain('<Collapsible');
  });
  it('the live workout keeps the current exercise open and does not remember per-workout choices', () => {
    const s = src('src/pages/session/SessionPage.tsx');
    expect(s).toContain('remember={false}');
    expect(s).toContain("it.status === 'doing'");
  });
  it('Today uses the week strip, the Quick grid and a single notice slot', () => {
    const s = src('src/pages/today/TodayPage.tsx');
    expect(s).toContain('<WeekView strip');
    expect(s).toContain('quickGrid(');
    expect(s).toContain('ONE notice slot');
  });
  it('a Collapsible with remember={false} is not stored', () => {
    const s = src('src/ui/components/Collapsible.tsx');
    expect(s).toContain('volatile.has(k)');
  });
});
