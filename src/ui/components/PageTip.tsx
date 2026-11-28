// Phase 117: the page-tip "i" button (Shell, once) and its small sheet. Tapping it explains the current page; the sheet has the app-wide switch,
// so tips can be turned off right there. Hidden while the walkthrough runs, on pages with no tip, and when tips are off.
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { Sheet } from './Overlay';
import { Switch } from './Rows';
import { showToast } from './Toast';
import { getRun, onRun } from '../../app/tourStore';
import { refreshTips, setTipsOn, useTipsOn } from '../../app/tipsStore';
import { tipForPath } from '../../shared/tips';

export function PageTip() {
  const [path] = useLocation();
  const on = useTipsOn();
  const [open, setOpen] = useState(false);
  const [touring, setTouring] = useState(getRun() !== null);
  const [missing, setMissing] = useState(false);
  useEffect(() => onRun((r) => setTouring(r !== null)), []);
  // A new install's default comes from the tour record, which is written after onboarding: read again on page changes (cheap, one row).
  useEffect(() => {
    void refreshTips();
    setOpen(false);
    // A page that is switched off shows "Page not found": no tip there. Looked at just after the page has rendered.
    setMissing(false);
    const id = window.setTimeout(() => setMissing(document.querySelector('[data-not-found]') !== null), 150);
    return () => window.clearTimeout(id);
  }, [path]);

  const tip = tipForPath(path);
  if (!tip || on !== true || touring || missing) return null;
  const turnOff = (next: boolean) => {
    void setTipsOn(next);
    if (!next) {
      setOpen(false);
      showToast(t('tips.offToast'));
    }
  };
  return (
    <>
      <Pressable class="sf-pagetip" aria-label={t('tips.open')} data-tour="page-tip" onPress={() => setOpen(true)}>
        <Icon name="info" size={22} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={t(tip.titleKey)}>
        <p class="sf-pagetip__body">{t(tip.bodyKey)}</p>
        <div class="sf-pagetip__row">
          <span class="sf-pagetip__label">{t('tips.switch')}</span>
          <Switch checked={on} onChange={turnOff} label={t('tips.switch')} />
        </div>
      </Sheet>
    </>
  );
}
