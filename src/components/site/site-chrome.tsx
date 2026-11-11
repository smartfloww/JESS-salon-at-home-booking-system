'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BUSINESS } from '@/lib/catalogue';

const navItems: { label: string; path: string }[] = [
  { label: 'Home', path: '/' },
  { label: 'Services', path: '/services' },
  { label: 'About', path: '/about' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="JESS Salon at Home home">
        <img className="brand-logo" src="/imgs/logo.jpeg" alt="" />
        <span className="brand-wordmark">
          <span className="brand-name">
            JESS<span className="brand-period">.</span>
          </span>
          <span className="brand-caption">SALON AT HOME</span>
        </span>
      </Link>
      <button
        className="menu-toggle"
        aria-expanded={open}
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        onClick={() => setOpen(!open)}
      >
        <span />
        <span />
      </button>
      <nav className={open ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation">
        {navItems.map((item) => {
          const active = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              className={active ? 'nav-link active' : 'nav-link'}
            >
              {item.label}
            </Link>
          );
        })}
        <Link href="/book" className="nav-book">
          Book a visit <span aria-hidden="true">↗</span>
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div>
          <Link className="brand footer-brand" href="/" aria-label="JESS Salon at Home home">
            <img className="brand-logo" src="/imgs/logo.jpeg" alt="" />
            <span className="brand-wordmark">
              <span className="brand-name">
                JESS<span className="brand-period">.</span>
              </span>
              <span className="brand-caption">SALON AT HOME</span>
            </span>
          </Link>
          <p className="footer-note">
            Good hair, in the comfort
            <br />
            of your own space.
          </p>
        </div>
        <div className="footer-column">
          <span className="eyebrow">EXPLORE</span>
          {navItems.map((item) => (
            <Link key={item.path} href={item.path}>
              {item.label}
            </Link>
          ))}
          <Link href="/book">Book a visit ↗</Link>
        </div>
        <div className="footer-column">
          <span className="eyebrow">GET IN TOUCH</span>
          <a href={BUSINESS.phoneHref}>{BUSINESS.phone}</a>
          <a href={BUSINESS.messenger} target="_blank" rel="noreferrer">
            Facebook Messenger ↗
          </a>
          <a href={BUSINESS.whatsapp} target="_blank" rel="noreferrer">
            WhatsApp ↗
          </a>
          <a href={BUSINESS.facebook} target="_blank" rel="noreferrer">
            Facebook ↗
          </a>
        </div>
        <div className="footer-column">
          <span className="eyebrow">SERVICE AREA</span>
          <p>Metro Manila, Cavite, Laguna, Batangas</p>
          <p>{BUSINESS.workingHours}</p>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {year} JESS Salon at Home</span>
        <span>Made for the way you live.</span>
      </div>
    </footer>
  );
}
