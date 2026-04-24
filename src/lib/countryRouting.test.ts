import { describe, it, expect } from 'vitest';
import { routeMidForCountry } from './countryRouting';

describe('routeMidForCountry', () => {
  it('routes US to 2D', () => expect(routeMidForCountry('US')).toBe('us_2d'));
  it('routes CA to 2D', () => expect(routeMidForCountry('CA')).toBe('us_2d'));
  it('routes FR to 3D', () => expect(routeMidForCountry('FR')).toBe('intl_3d'));
  it('routes unknown to 3D', () => expect(routeMidForCountry(null)).toBe('intl_3d'));
  it('is case-insensitive', () => expect(routeMidForCountry('us')).toBe('us_2d'));
});
