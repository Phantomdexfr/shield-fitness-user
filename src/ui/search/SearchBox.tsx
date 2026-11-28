// Search box (Phase 20): the one search input every picker uses (library, routine builder picker, swap sheet,
// custom-exercise machine picker). It shows the input, an optional extra action next to it, "did you mean",
// a setup chip for the top result, and the recent searches kept on the device. It owns no data: the caller passes
// the text, the results' hints and the recents, and handles the events.

import type { ComponentChildren } from 'preact';
import { t } from '../../i18n';
import { Button, Chip, Input } from '../components';

// `Input` (Phase 3) types its props as plain HTMLAttributes, but forwards every prop to the <input>. Spread so Phase 3 stays untouched.
const searchAttrs: Record<string, string> = { type: 'search', inputmode: 'search', enterkeyhint: 'search', autocomplete: 'off' };

export interface SearchBoxProps {
  value: string;
  placeholder: string;
  onInput: (value: string) => void;
  /** Blur or Enter: the caller saves the search to the recents. */
  onCommit?: () => void;
  /** "Did you mean <text>?" (a corrected query that finds something). */
  didYouMean?: string;
  /** Chip for the top result's setup, e.g. "Top result with supinated". */
  setupChip?: { label: string; onPress: () => void };
  /** Recent searches, shown only while the box is empty. */
  recents?: readonly string[];
  onRemoveRecent?: (q: string) => void;
  onClearRecents?: () => void;
  /** Extra control beside the input (the library puts its Filters button here). */
  actions?: ComponentChildren;
  /** Phase 113 (Tidy layout): no visible "Search" label above the box (aria-label stays). */
  hideLabel?: boolean;
}

export function SearchBox(p: SearchBoxProps) {
  const recents = p.recents ?? [];
  return (
    <>
      <div class="sf-lib__searchrow" data-tour="library-search">
        <Input
          label={t('lib.search')}
          {...(p.hideLabel ? { hideLabel: true } : {})}
          {...searchAttrs}
          {...{ value: p.value, placeholder: p.placeholder }}
          onInput={(e) => p.onInput((e.currentTarget as HTMLInputElement).value)}
          onCancel={() => p.onInput('')}
          cancelLabel={t('cx.cancel')}
          onBlur={p.onCommit}
          onKeyDown={(e) => e.key === 'Enter' && p.onCommit?.()}
        />
        {p.actions}
      </div>

      {p.didYouMean && (
        <p class="sf-lib__hint" role="status">
          {t('lib.didyoumean')}{' '}
          <button type="button" class="sf-lib__dym" onClick={() => p.onInput(p.didYouMean as string)}>
            {p.didYouMean}
          </button>
          ?
        </p>
      )}

      {p.setupChip && (
        <div class="sf-lib__chipgroup" role="group" aria-label={t('lib.setup.group')}>
          <Chip onPress={p.setupChip.onPress}>{p.setupChip.label}</Chip>
        </div>
      )}

      {p.value === '' && recents.length > 0 && (
        <div class="sf-lib__recent" role="group" aria-label={t('lib.recent')}>
          <h2 class="sf-lib__h">{t('lib.recent')}</h2>
          <ul class="sf-lib__chips">
            {recents.map((r) => (
              <li key={r} class="sf-lib__recentitem">
                <Chip onPress={() => p.onInput(r)}>{r}</Chip>
                <button type="button" class="sf-lib__x" aria-label={t('lib.recent.remove', { q: r })} onClick={() => p.onRemoveRecent?.(r)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          {p.onClearRecents && (
            <Button variant="secondary" onPress={p.onClearRecents}>
              {t('lib.recent.clear')}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
