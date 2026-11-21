// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { goBack, installNavIndex, navIndex } from '../../src/app/navBack';

beforeAll(() => installNavIndex());

// The tests run in order and share one history, like a visit does.
describe('back arrow does not loop', () => {
  it('with nothing behind (opened on this page), Back replaces to the fallback', () => {
    expect(navIndex()).toBe(0);
    const nav = vi.fn();
    goBack(nav, '/settings');
    expect(nav).toHaveBeenCalledWith('/settings', { replace: true });
  });
  it('counts in-app pushes, keeps the count on replace', () => {
    history.pushState(null, '', '/settings');
    history.pushState(null, '', '/settings/data');
    expect(navIndex()).toBe(2);
    history.replaceState(null, '', '/settings/about');
    expect(navIndex()).toBe(2);
  });
  it('with pages behind, Back is a real history step and adds nothing', () => {
    const nav = vi.fn();
    const back = vi.spyOn(history, 'back').mockImplementation(() => {});
    goBack(nav, '/me');
    expect(back).toHaveBeenCalledOnce();
    expect(nav).not.toHaveBeenCalled();
    back.mockRestore();
  });
});
