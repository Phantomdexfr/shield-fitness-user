import { useEffect, useState } from 'preact/hooks';
import { Button, Icon, ToastHost, showToast, type IconName } from '../ui/components';
import { t, type StringKey } from '../i18n';
import type { InstallState } from './installGate';
import { hasInstallPrompt, onPromptChange, promptInstall } from './prompt';

interface Step {
  key: StringKey;
  icon?: IconName;
}

const STEPS: Partial<Record<InstallState, Step[]>> = {
  'android-promptable': [{ key: 'gate.android.step1', icon: 'dots-three-vertical' }, { key: 'gate.android.step2', icon: 'download-simple' }, { key: 'gate.android.step3', icon: 'device-mobile' }],
  'android-other': [{ key: 'gate.android.step1', icon: 'dots-three-vertical' }, { key: 'gate.android.step2', icon: 'download-simple' }, { key: 'gate.android.step3', icon: 'device-mobile' }],
  'ios-safari': [{ key: 'gate.ios.step1', icon: 'export' }, { key: 'gate.ios.step2', icon: 'plus-square' }, { key: 'gate.ios.step3', icon: 'device-mobile' }],
  'ios-other': [{ key: 'gate.iosother.step1', icon: 'copy' }, { key: 'gate.iosother.step2', icon: 'export' }, { key: 'gate.iosother.step3', icon: 'plus-square' }],
  'in-app-browser': [{ key: 'gate.inapp.step1', icon: 'dots-three-vertical' }, { key: 'gate.inapp.step2', icon: 'export' }, { key: 'gate.inapp.step3', icon: 'download-simple' }],
};

function QrCode({ url }: { url: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let live = true;
    // Generated on the device, no network call; loaded only when the desktop screen shows.
    import('qrcode-generator').then((m) => {
      const qr = m.default(0, 'M');
      qr.addData(url);
      qr.make();
      const raw = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      if (live) setSvg(raw.replace(/fill="black"/g, 'fill="currentColor"').replace(/fill="white"/g, 'fill="none"'));
    });
    return () => {
      live = false;
    };
  }, [url]);
  return <div class="sf-gate__qr" role="img" aria-label={t('gate.desktop.qr')} dangerouslySetInnerHTML={{ __html: svg }} />;
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.href);
    showToast(t('gate.copied'), { tone: 'ok' });
  } catch {
    showToast(t('gate.copy.failed'), { tone: 'warn', durationMs: 6000 });
  }
}

/** The only screen rendered until the app runs installed. Makes no data or network call. */
export function InstallGate({ state }: { state: InstallState }) {
  const [, bump] = useState(0);
  useEffect(() => onPromptChange(() => bump((n) => n + 1)), []);
  const isAndroidState = state === 'android-promptable' || state === 'android-other';
  // The browser can fire `beforeinstallprompt` after the page loaded, so the live check wins over the state read at start.
  const canPrompt = isAndroidState && hasInstallPrompt();
  const onInstall = async () => {
    if (!hasInstallPrompt()) {
      showToast(t('gate.android.menu'), { tone: 'warn', durationMs: 8000 });
      return;
    }
    if (await promptInstall()) showToast(t('gate.android.installing'), { tone: 'ok', durationMs: 8000 });
  };

  let title = t('gate.title');
  let lead = t('gate.lead');
  if (state === 'ios-other') lead = t('gate.iosother.lead');
  if (state === 'in-app-browser') {
    title = t('gate.inapp.title');
    lead = t('gate.inapp.lead');
  }
  if (state === 'desktop') {
    title = t('gate.desktop.title');
    lead = t('gate.desktop.lead');
  }
  if (state === 'unsupported') {
    title = t('gate.unsupported.title');
    lead = t('gate.unsupported.lead');
  }
  if (state === 'installed') lead = t('gate.installed');
  const steps = STEPS[state];

  return (
    <main class="sf-gate">
      <h1 class="sf-gate__title">{title}</h1>
      <p class="sf-gate__lead">{lead}</p>
      {isAndroidState && (
        <Button variant="primary" size="lg" icon="download-simple" fullWidth onPress={() => void onInstall()}>
          {t('gate.android.install')}
        </Button>
      )}
      {canPrompt && <p class="sf-gate__lead">{t('gate.android.fallback')}</p>}
      {state === 'desktop' && <QrCode url={location.href} />}
      {steps && (
        <ol class="sf-gate__steps">
          {steps.map((s, i) => (
            <li class="sf-gate__step" key={s.key}>
              <span class="sf-gate__num" aria-label={`${t('gate.step.label')} ${i + 1}`}>
                {i + 1}
              </span>
              <span class="sf-gate__text">{t(s.key)}</span>
              {s.icon && <Icon name={s.icon} class="sf-gate__icon" />}
            </li>
          ))}
        </ol>
      )}
      {steps && <p class="sf-gate__lead">{t('gate.restore')}</p>}
      {(state === 'ios-other' || state === 'in-app-browser') && (
        <Button variant="secondary" icon="copy" fullWidth onPress={() => void copyLink()}>
          {t('gate.copy')}
        </Button>
      )}
      <ToastHost />
    </main>
  );
}
