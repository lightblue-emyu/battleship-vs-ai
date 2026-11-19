import { describe, expect, it } from 'vitest';
import css from '../src/style.css?raw';

// jsdom does not lay pages out, so these check the CSS rules that keep the page inside a phone screen.
const narrow = css.slice(css.indexOf('@media (max-width: 1000px)'));

describe('スタイル（スマホの幅）', () => {
  it('狭い画面では盤面の枠が画面より広がらず、右上のボタンは折り返して並ぶ', () => {
    expect(narrow).toMatch(/\.layout\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    expect(css).toMatch(/\.grid-scroll\s*\{\s*overflow-x:\s*auto;/);
    expect(css).toMatch(/\.header-side\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.header-side button\s*\{\s*white-space:\s*nowrap;/);
  });
});
