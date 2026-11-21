/** Theme is built from the CSS variables in src/ui/styles/tokens.css (no colour literals here).
 *  `theme.colors` is REPLACED (not extended) so Tailwind's default palette (purple, pink...) does not exist.
 *  Preflight is off: src/ui/styles/base.css is the reset. */
const v = (name) => `var(--${name})`;
const ramp = (prefix, keys) => Object.fromEntries(keys.map((k) => [k, v(`${prefix}-${k}`)]));

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      bg: ramp('bg', ['void', 'base', 'raised', 'card', 'hover']),
      line: { DEFAULT: v('line'), strong: v('line-strong') },
      ink: { DEFAULT: v('text'), 2: v('text-2'), muted: v('text-muted'), 'on-gold': v('text-on-gold') },
      gold: ramp('gold', ['100', '200', '300', '400', '500', '600', '700']),
      ok: v('ok'),
      warn: v('warn'),
      danger: v('danger'),
      info: v('info'),
      rank: ramp('rank', ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'shield-elite']),
      tier: ramp('tier', ['wood', 'beginner', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'olympian']),
      chart: ramp('chart', ['1', '2', '3', '4', '5', '6']),
      heat: ramp('heat', ['0', '1', '2', '3', '4', '5']),
      loss: ramp('loss', ['1', '2', '3', '4', '5']),
      rec: ramp('rec', ['fatigued', 'recovering', 'ready', 'fresh']),
    },
    spacing: {
      0: '0px',
      px: '1px',
      ...ramp('sp', ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']),
    },
    borderRadius: {
      none: '0px',
      sm: v('r-sm'),
      md: v('r-md'),
      lg: v('r-lg'),
      xl: v('r-xl'),
      pill: v('r-pill'),
    },
    fontFamily: { ui: [v('font-ui')], display: [v('font-display')] },
    fontSize: {
      xs: v('text-xs'),
      sm: v('text-sm'),
      md: v('text-md'),
      lg: v('text-lg'),
      xl: v('text-xl'),
      '2xl': v('text-2xl'),
      '3xl': v('text-3xl'),
    },
    boxShadow: { card: v('sh-card'), press: v('sh-press'), glow: v('glow-gold'), none: 'none' },
    transitionTimingFunction: { spring: v('ease-spring'), out: v('ease-out') },
    transitionDuration: { fast: v('dur-fast'), base: v('dur-base'), slow: v('dur-slow') },
    extend: {},
  },
  plugins: [],
};
