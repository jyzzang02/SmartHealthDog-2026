import { getUrinePhotoCrop } from './urinePhotoCrop';

const photo = { width: 600, height: 1200 };
const frame = { width: 300, height: 420 };

it('keeps the whole photo when zoomed out without adding black borders', () => {
  expect(getUrinePhotoCrop(photo, { left: 75, top: 60, renderedScale: 0.25 }, frame))
    .toEqual({ x: 0, y: 0, width: 600, height: 1200 });
});

it('crops the visible region of a zoomed and moved photo', () => {
  expect(getUrinePhotoCrop(photo, { left: -50, top: -140, renderedScale: 0.5 }, frame))
    .toEqual({ x: 100, y: 280, width: 500, height: 840 });
});

it('rejects a photo dragged entirely outside the frame', () => {
  expect(getUrinePhotoCrop(photo, { left: 350, top: 0, renderedScale: 0.25 }, frame)).toBeUndefined();
});
