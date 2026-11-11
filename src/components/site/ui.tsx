'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

/** Booking call-to-action link/button. */
export function BookingLink({
  href = '/book',
  children,
  className = 'button button-gold',
}: {
  href?: string;
  children: ReactNode;
  className?: string;
}) {
  const isExternal = /^https?:\/\//.test(href);
  if (isExternal) {
    return (
      <a href={href} className={className} target="_blank" rel="noreferrer">
        {children} <span aria-hidden="true">↗</span>
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children} <span aria-hidden="true">↗</span>
    </Link>
  );
}

export function PageIntro({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: ReactNode;
  text?: string;
}) {
  return (
    <section className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {text && <p className="intro-copy">{text}</p>}
    </section>
  );
}

export function BookingBand({ children = 'Start a conversation' }: { children?: ReactNode }) {
  return (
    <section className="booking-band">
      <p className="eyebrow">A GOOD HAIR DAY, AT HOME</p>
      <h2>
        Let’s find a time
        <br />
        that works for you.
      </h2>
      <BookingLink>{children}</BookingLink>
    </section>
  );
}

export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true">{diagonal ? '↗' : '→'}</span>;
}
