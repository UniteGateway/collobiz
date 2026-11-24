import type { Metadata } from 'next';
import Link from 'next/link';
import { UC_VALUES } from '@collabiz/types';
import { ImageFeature, PageHero, PhotoCards, PhotoCta, PhotoMosaic } from '@/components/PageHero';
import { UcChapterList } from '@/components/UniteClub';

export const metadata: Metadata = {
  title: 'Unite Club',
  description: 'A business club with local chapters — meet every week, pass referrals, serve your city and grow together. Like Rotary, Lions or BNI, inside COLLABIZ.',
};
const VALUE_PHOTOS = ['collab-hands', 'team-boardroom', 'team-meeting', 'growth-seedling', 'team-handshake'];

/** Unite Club — public landing page. */
export default function UniteClubPage() {
  return (
    <div className="cz-page" data-screen="unite-club">
      <PageHero layout="cover" tone="ocean" image="team-success" eyebrow="Unite Club" title={<>Business people who<br />help each other grow.</>}
        lead="Unite Club is a business club with local chapters. Members meet every week, pass referrals to each other, serve their city and grow together — in the spirit of Rotary, Lions and BNI."
        actions={<><Link href="/my-club" className="cz-btn cz-btn-accent cz-btn-lg">Join or start a chapter</Link><a href="#chapters" className="cz-btn cz-btn-secondary cz-btn-lg">Find a chapter</a></>} />
      <div className="cz-container">
        <section>
          <h2 className="cz-big">What the club stands for</h2>
          <p className="cz-sublead">Five simple ideas every chapter follows.</p>
          <PhotoCards items={UC_VALUES.map((v, i) => ({ image: VALUE_PHOTOS[i], title: v.title, text: v.text }))} />
        </section>
        <ImageFeature image="team-boardroom" eyebrow="Chapter meetings" title="Meet every week — in person or in U meet." tone="ocean">
          <p>Each chapter sets its own day and time. Members introduce their business, pass referrals and hear from a guest speaker. Online meetings open a U meet room with video and chat for every member.</p>
        </ImageFeature>
        <ImageFeature image="deal-handshake" eyebrow="Referrals" title="Pass business to each other — with consent." tone="forest" reverse>
          <p>When someone you know needs what another member sells, pass a referral in the app. Contact details go only to that member, and only with the person’s consent. Members record when a referral turns into business, so the chapter can see the value it creates.</p>
        </ImageFeature>
        <ImageFeature image="growth-green-energy" eyebrow="Service" title="Give back to your city." tone="teal">
          <p>Chapters run service projects — health camps, school support, tree planting and skills days — and members log the hours they give.</p>
        </ImageFeature>
        <section>
          <h2 className="cz-big">How to join</h2>
          <PhotoCards items={[
            { image: 'person-laptop', badge: '1', title: 'Create a free account', text: 'Sign up as a business on COLLABIZ.' },
            { image: 'team-desk', badge: '2', title: 'Pick a chapter near you', text: 'Apply with your business category. Each chapter has one seat per category.' },
            { image: 'team-handshake', badge: '3', title: 'The chapter welcomes you', text: 'The president or secretary approves your application.' },
            { image: 'team-meeting', badge: '4', title: 'Meet, refer, serve', text: 'Come to meetings, pass referrals and join service projects.' },
          ]} />
          <p className="cz-muted" style={{ marginTop: 16 }}>No chapter in your city? Any member can propose one; the Unite team approves it and you become its first president.</p>
        </section>
        <section id="chapters" aria-labelledby="uc-ch">
          <h2 id="uc-ch" className="cz-big">Chapters</h2>
          <UcChapterList />
        </section>
        <section><PhotoMosaic photos={[['team-startup', 'Members at a chapter social'], ['build-engineers', 'Members on a business visit'], ['energy-installer', 'A member at work'], ['office-loft', 'A chapter meeting venue']]} /></section>
        <PhotoCta image="collab-overhead" title="Bring your business to a chapter" text="Membership is approved by each chapter. Any chapter dues are set and collected by the chapter itself, not through COLLABIZ.">
          <Link href="/my-club" className="cz-btn cz-btn-accent cz-btn-lg">Join or start a chapter</Link>
        </PhotoCta>
      </div>
    </div>
  );
}
