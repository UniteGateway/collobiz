import { describe, expect, it } from 'vitest';
import { DashboardContentSchema, themeForSectors, videoEmbed } from './dashboard';

describe('dashboard', () => {
  it('picks the theme from the first sector that has one', () => {
    expect(themeForSectors(['solar', 'construction_epc'])).toBe('energy');
    expect(themeForSectors(['trading'])).toBe('trade');
    expect(themeForSectors([])).toBe('collabiz');
    expect(themeForSectors(['unknown', 'manufacturing'])).toBe('industry');
  });
  it('accepts only YouTube and Vimeo videos, as privacy-friendly embeds', () => {
    expect(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbed('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbed('https://vimeo.com/76979871')).toBe('https://player.vimeo.com/video/76979871');
    expect(videoEmbed('https://example.com/video.mp4')).toBeNull();
    expect(DashboardContentSchema.safeParse({ kind: 'video', title: 'Demo', url: 'https://example.com/v.mp4' }).success).toBe(false);
    expect(DashboardContentSchema.safeParse({ kind: 'ad', title: 'Sell Powertek', url: '/powertek', theme: 'energy' }).success).toBe(true);
  });
});
