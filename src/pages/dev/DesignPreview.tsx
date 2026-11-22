import { useState } from 'preact/hooks';
import { Avatar, Badge, Button, Card, Chip, Dialog, EmptyState, Field, IconButton, Input, PhotoFrame, ProgressBar, ProgressRing, Segmented, Select, Sheet, Skeleton, SkeletonText, Stepper, Tabs, Toggle, showToast } from '../../ui/components';
import { t } from '../../i18n';
import ChartPreview from './ChartPreview';
import { BodyPicker, MuscleChips, type BodyMode, type Sex, type View } from '../../ui/body';

/** Developer-only preview of every primitive. Registered only in dev builds. */
export default function DesignPreview() {
  const [seg, setSeg] = useState<'a' | 'b' | 'c'>('a');
  const [tab, setTab] = useState<'one' | 'two'>('one');
  const [sel, setSel] = useState('x');
  const [on, setOn] = useState(true);
  const [n, setN] = useState(60);
  const [chip, setChip] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [dlg, setDlg] = useState(false);
  const [bmode, setBmode] = useState<BodyMode>('pick-many');
  const [bsex, setBsex] = useState<Sex>('male');
  const [bview, setBview] = useState<View>('front');
  const [bval, setBval] = useState<string[]>(['chest']);

  return (
    <section class="sf-page-body">
      <h1 class="sf-page-title">{t('preview.title')}</h1>
      <p class="sf-page-param">{t('preview.hint')}</p>

      <h2 class="sf-preview-h">{t('preview.buttons')}</h2>
      <div class="sf-preview-row">
        <Button variant="primary" icon="plus">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <IconButton icon="info" label="Info" />
      </div>
      <Button fullWidth>{t('preview.sample.long')}</Button>

      <h2 class="sf-preview-h">{t('preview.chips')}</h2>
      <div class="sf-preview-row">
        <Chip selected={chip} onPress={() => setChip(!chip)}>Chest</Chip>
        <Chip>Back</Chip>
        <Badge tone="gold">Gold</Badge>
        <Badge tone="ok">Ok</Badge>
        <Badge tone="warn">Warn</Badge>
        <Badge tone="danger">Danger</Badge>
        <Avatar name="Shield Fitness" />
      </div>

      <h2 class="sf-preview-h">{t('preview.choice')}</h2>
      <Segmented label="Segmented" options={[{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }, { value: 'c', label: 'Three' }]} value={seg} onChange={setSeg} />
      <Tabs label="Tabs" items={[{ value: 'one', label: 'First' }, { value: 'two', label: 'Second' }]} active={tab} onChange={setTab} />

      <h2 class="sf-preview-h">{t('preview.form')}</h2>
      <Card>
        <Input label="Name" hint="Shown on this device only" />
        <Select label="Unit" options={[{ value: 'x', label: 'Kilograms' }, { value: 'y', label: 'Pounds' }]} value={sel} onChange={setSel} />
        <Toggle label="Rest-day hints" checked={on} onChange={setOn} />
        <Stepper label="Weight (kg)" value={n} onChange={setN} step={2.5} min={0} max={300} />
      </Card>

      <h2 class="sf-preview-h">{t('preview.overlays')}</h2>
      <div class="sf-preview-row">
        <Button variant="secondary" onPress={() => setSheet(true)}>{t('preview.open.sheet')}</Button>
        <Button variant="secondary" onPress={() => setDlg(true)}>{t('preview.open.dialog')}</Button>
        <Button variant="secondary" onPress={() => showToast(t('preview.toast.message'), { tone: 'ok' })}>{t('preview.show.toast')}</Button>
      </div>
      <Sheet open={sheet} onClose={() => setSheet(false)} title={t('preview.sheet.title')}>
        <p>{t('preview.sample.long')}</p>
      </Sheet>
      <Dialog open={dlg} title={t('preview.dialog.title')} message={t('preview.dialog.message')} onConfirm={() => setDlg(false)} onCancel={() => setDlg(false)} />

      <h2 class="sf-preview-h">{t('preview.body')}</h2>
      <Segmented label={t('preview.body.mode')} options={[{ value: 'pick-many', label: 'Pick' }, { value: 'heat', label: 'Heat' }, { value: 'recovery', label: 'Rest' }, { value: 'marks', label: 'Marks' }]} value={bmode === 'pick-one' || bmode === 'view' ? 'pick-many' : bmode} onChange={(m) => setBmode(m)} />
      <BodyPicker
        mode={bmode}
        sex={bsex}
        view={bview}
        onSexChange={setBsex}
        onViewChange={setBview}
        value={bval}
        onChange={setBval}
        heat={{ chest: 4, upper_chest: 5, biceps: 2, quads: 3, lats: 1 }}
        recovery={{ chest: 'fatigued', quads: 'recovering', biceps: 'ready', abs: 'fresh' }}
        marks={{ side_delts: 'avoid', calves: 'sore' }}
      />
      <MuscleChips mode={bmode} value={bval} onChange={setBval} heat={{ chest: 4, upper_chest: 5, biceps: 2, quads: 3, lats: 1 }} recovery={{ chest: 'fatigued', quads: 'recovering', biceps: 'ready', abs: 'fresh' }} marks={{ side_delts: 'avoid', calves: 'sore' }} />

      <h2 class="sf-preview-h">{t('preview.feedback')}</h2>
      <div class="sf-preview-row">
        <ProgressRing value={0.64} label="64 percent" />
        <ProgressBar value={0.4} label="40 percent" />
      </div>
      <Skeleton height="2rem" />
      <SkeletonText lines={3} />
      <PhotoFrame alt="Placeholder" />
      <EmptyState icon="info" title={t('page.soon.title')} hint={t('page.soon.hint')} />
      <ChartPreview />
    </section>
  );
}
