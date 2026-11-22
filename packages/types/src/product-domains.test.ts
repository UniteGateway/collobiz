import { describe, expect, it } from 'vitest';
import { productSubdomain, productUrl, subdomainPath } from './product-domains';

describe('product subdomains', () => {
  it('maps slugs to short labels and back', () => {
    expect(productSubdomain('sunx')).toBe('sunx');
    expect(productSubdomain('nano-bazar')).toBe('nanobazar');
    expect(subdomainPath('nanobazar')).toBe('/businesses/nano-bazar');
    expect(subdomainPath('sunx')).toBe('/businesses/sunx');
    expect(subdomainPath('SunX')).toBe('/businesses/sunx');
    expect(subdomainPath('goeb5')).toBe('/go-eb5/apply');
  });
  it('never treats platform hosts or invalid labels as products', () => {
    for (const s of ['www', 'admin', 'api', 'app', 'power', '-bad', 'a_b', '']) expect(subdomainPath(s)).toBeNull();
  });
  it('builds subdomain URLs when a products domain is configured, otherwise main-site paths', () => {
    expect(productUrl('unite-powertek', { productsDomain: 'unite.example', ref: 'ASHA2026' })).toBe('https://powertek.unite.example/?ref=ASHA2026');
    expect(productUrl('sunx', { productsDomain: 'localhost:3000' })).toBe('http://sunx.localhost:3000/');
    expect(productUrl('sunx', { webUrl: 'https://collabiz.example' })).toBe('https://collabiz.example/businesses/sunx');
  });
});
