// @ts-expect-error -- Node's type definitions are not installed; the tests run in Node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// jsdom does not lay pages out, so these check the CSS rules that keep the page inside a phone screen.
const css: string = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const narrow = css.slice(css.indexOf('@media (max-width: 1000px)'));

describe('スタイル（スマホの幅）', () => {
  it('狭い画面では盤面の枠が画面より広がらず、右上のボタンは折り返して並ぶ', () => {
    expect(narrow).toMatch(/\.layout\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    expect(css).toMatch(/\.grid-scroll\s*\{\s*overflow-x:\s*auto;/);
    expect(css).toMatch(/\.header-side\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.header-side button\s*\{\s*white-space:\s*nowrap;/);
  });
});
