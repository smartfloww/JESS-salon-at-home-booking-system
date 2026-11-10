"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const WA =
  "https://wa.me/639977491555?text=Hi%20JESS%20Salon%20at%20Home!%20I%27d%20like%20to%20inquire%20about%20your%20hair%20services%20and%20book%20an%20appointment.";
const MSG = "https://m.me/61580949253081";
const FB = "https://www.facebook.com/profile.php?id=61580949253081";
const PHONE = "tel:+639977491555";

const navItems = [
  { label: "Home", path: "/" },
  { label: "Services", path: "/services" },
  { label: "About", path: "/about" },
];

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true">{diagonal ? "↗" : "→"}</span>;
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);

  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="JESS Salon at Home home" onClick={close}>
        <img className="brand-logo" src="/logo.jpeg" alt="" />
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
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        onClick={() => setOpen(!open)}
      >
        <span />
        <span />
      </button>
      <nav className={open ? "main-nav is-open" : "main-nav"} aria-label="Main navigation">
        {navItems.map((item) => {
          const active = item.path === "/" ? pathname === "/" : pathname?.startsWith(item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              className={active ? "nav-link active" : "nav-link"}
              onClick={close}
            >
              {item.label}
            </Link>
          );
        })}
        <Link href="/book" className="nav-book" onClick={close}>
          Book a visit <Arrow diagonal />
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div>
          <Link className="brand footer-brand" href="/" aria-label="JESS Salon at Home home">
            <img className="brand-logo" src="/logo.jpeg" alt="" />
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
          <Link href="/book">Book a visit</Link>
        </div>
        <div className="footer-column">
          <span className="eyebrow">GET IN TOUCH</span>
          <a href={PHONE}>+63 997 749 1555</a>
          <a href={MSG} target="_blank" rel="noreferrer">
            Facebook Messenger ↗
          </a>
          <a href={WA} target="_blank" rel="noreferrer">
            WhatsApp ↗
          </a>
        </div>
        <div className="footer-column">
          <span className="eyebrow">SERVICE AREA</span>
          <p>Metro Manila · Cavite · Laguna · Batangas</p>
          <p>Daily · 8 AM–6 PM</p>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} JESS Salon at Home</span>
        <span>Made for the way you live.</span>
      </div>
    </footer>
  );
}

export function MobileBookBar() {
  return (
    <Link className="mobile-booking" href="/book">
      Book a visit <Arrow diagonal />
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="app-main">{children}</main>
      <SiteFooter />
      <MobileBookBar />
    </div>
  );
}
