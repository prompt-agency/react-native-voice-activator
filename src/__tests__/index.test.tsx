jest.mock('../NativeVoiceActivator', () => ({
  __esModule: true,
  default: {
    multiply: jest.fn((a: number, b: number) => a * b),
  },
}));

import { multiply } from '../index';

describe('bootstrap public API', () => {
  it('delegates multiply to the native scaffold module', () => {
    expect(multiply(3, 7)).toBe(21);
  });
});
