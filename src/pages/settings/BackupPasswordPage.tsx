import { useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { freeConfig } from '../../app/freeBuild';
import { Button, SubPageHeader, Toggle } from '../../ui/components';
import { takeShownOnce } from '../../data/gym/freeAccount';

/** The page's colours come from the design tokens (read at draw time), never from hex in code. */
function cssVar(name: string, fallback: string): string {
  const v = typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
/** Save as image: a plain card with the id, username and password, downloaded as a PNG. Nothing is uploaded. */
async function saveImage(lines: string[]): Promise<boolean> {
  const c = document.createElement('canvas');
  c.width = 900;
  c.height = 80 + lines.length * 90;
  const g = c.getContext('2d');
  if (!g) return false;
  g.fillStyle = cssVar('--bg', 'black');
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = cssVar('--gold-400', 'white');
  g.font = '40px monospace';
  lines.forEach((l, i) => g.fillText(l, 40, 90 + i * 90));
  const blob: Blob | null = await new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
  if (!blob) return false;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'shield-fitness-backup.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return true;
}

/** R4 (/settings/backup/password): the generated password, shown ONCE. It lives in memory only; a reload or a second visit cannot show it again. */
export default function BackupPasswordPage() {
  const [, navigate] = useLocation();
  const [shown] = useState(() => takeShownOnce()); // read once: the module copy is cleared
  const [saved, setSaved] = useState(false);
  const [show, setShow] = useState(true);
  const [note, setNote] = useState<StringKey | null>(null);
  const [busy, setBusy] = useState(false);

  const text = shown ? `${t('bk.pw.id', { id: shown.freeId })}\n${t('bk.pw.user', { username: shown.username })}\n${shown.password}` : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(shown!.password); setNote('bk.pw.copied'); } catch { setNote(null); }
  };
  const share = async () => {
    try { await navigator.share({ text }); } catch { /* cancelled */ }
  };
  const image = async () => {
    if (await saveImage([shown!.freeId, shown!.username, shown!.password]).catch(() => false)) setNote('bk.pw.imaged');
  };
  const done = async () => {
    setBusy(true);
    const m = await import('../../data/gym/freeAccount');
    await m.confirmSaved();
    setBusy(false);
    navigate('/settings/backup/questions', { replace: true }); // R3 is required before the first backup (it calls finishSetup itself)
  };

  if (!shown) {
    return (
      <section class="sf-page-body sf-st">
        <SubPageHeader title={t('bk.pw.h')} onBack={() => navigate('/settings/backup', { replace: true })} />
        <p class="sf-st__para" role="status">{t('bk.pw.gone')}</p>
        <Button onPress={() => navigate('/settings/backup', { replace: true })}>{t('bk.back')}</Button>
      </section>
    );
  }
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('bk.pw.h')} onBack={() => navigate('/settings/backup', { replace: true })} />
      <p class="sf-st__err" role="alert">{t('bk.pw.once')}</p>
      <p class="sf-st__para">{t('bk.pw.id', { id: shown.freeId })}</p>
      <p class="sf-st__para">{t('bk.pw.user', { username: shown.username })}</p>
      <p class="sf-st__title" style={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }} data-testid="free-password">{show ? shown.password : '•'.repeat(shown.password.length)}</p>
      <Toggle checked={show} onChange={setShow} label={t('bk.si.show')} />
      <Button variant="secondary" onPress={() => void copy()}>{t('bk.pw.copy')}</Button>
      {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && <Button variant="secondary" onPress={() => void share()}>{t('bk.pw.share')}</Button>}
      <Button variant="secondary" onPress={() => void image()}>{t('bk.pw.image')}</Button>
      {note && <p class="sf-st__ok" role="status">{t(note)}</p>}
      <p class="sf-st__hint">{t('bk.pw.warn')}</p>
      <Toggle checked={saved} onChange={setSaved} label={t('bk.pw.tick')} />
      <Button disabled={!saved || busy} onPress={() => void done()}>{busy ? t('bk.busy') : t('bk.pw.done')}</Button>
    </section>
  );
}
