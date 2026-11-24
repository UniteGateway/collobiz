import { describe, expect, it } from 'vitest';
import { SocialLinksSchema, guideReply, youtubeId } from './site';

describe('site content', () => {
  it('reads YouTube ids from every usual link', () => {
    for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'https://youtu.be/dQw4w9WgXcQ', 'https://youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ']) expect(youtubeId(u)).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://vimeo.com/123')).toBeNull();
    expect(youtubeId('https://evil.example/watch?v=dQw4w9WgXcQ')).toBeNull();
  });
  it('accepts social links only on the network’s own site, over https', () => {
    expect(SocialLinksSchema.safeParse({ facebook: 'https://www.facebook.com/unite' }).success).toBe(true);
    expect(SocialLinksSchema.safeParse({ facebook: 'https://evil.example/unite' }).success).toBe(false);
    expect(SocialLinksSchema.safeParse({ instagram: 'http://instagram.com/unite' }).success).toBe(false);
  });
  it('the guide routes common questions and hands over on request', () => {
    expect(guideReply('I want to become a cement dealer').links[0].href).toBe('/partner-with-unite');
    expect(guideReply('solar for my roof').links[0].href).toBe('/businesses/sunx');
    expect(guideReply('can I talk to a person?').handover).toBe(true);
    expect(guideReply('xyz').links.length).toBe(4);
  });
});
