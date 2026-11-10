import Link from "next/link";
import { AppShell } from "@/components/site-shell";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true">{diagonal ? "↗" : "→"}</span>;
}

function BookingLink({
  children,
  className = "button button-gold",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href="/book" className={className}>
      {children} <Arrow diagonal />
    </Link>
  );
}

function BookingBand() {
  return (
    <section className="booking-band">
      <p className="eyebrow">A GOOD HAIR DAY, AT HOME</p>
      <h2>
        Let&apos;s find a time
        <br />
        that works for you.
      </h2>
      <BookingLink>Start your booking</BookingLink>
    </section>
  );
}

export default function HomePage() {
  return (
    <AppShell>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow gold-eyebrow">SALON QUALITY, AT YOUR DOORSTEP</p>
          <h1>
            Your Hair.
            <br />
            Your Home.
            <br />
            <em>Your Style.</em>
          </h1>
          <p className="hero-description">
            Thoughtful hair services for men and women, brought to you across Metro Manila.
          </p>
          <BookingLink>Book your appointment</BookingLink>
          <div className="hero-footnote">
            <span>MEN & WOMEN</span>
            <span>METRO MANILA</span>
          </div>
        </div>
        <div className="hero-image-wrap">
          <img
            src="/hero-hair.png"
            alt="Long, glossy brunette waves"
            className="hero-image"
            fetchPriority="high"
          />
          <span className="image-index">01 / JESS AT HOME</span>
        </div>
        <div className="hero-side-label">YOUR SPACE, YOUR PACE</div>
      </section>

      <section className="welcome section-shell">
        <div className="section-heading">
          <p className="eyebrow">A LITTLE MORE YOU</p>
          <h2>
            Good hair.
            <br />
            <em>No salon trip.</em>
          </h2>
        </div>
        <div className="welcome-copy">
          <p>
            Make time for the style you want, without leaving the place you feel
            most at ease. JESS brings hair services to your home, with a personal
            conversation before every appointment.
          </p>
          <Link href="/services" className="text-link">
            Explore our services <Arrow />
          </Link>
        </div>
      </section>

      <section className="featured-services">
        <div className="section-shell">
          <div className="section-topline">
            <div>
              <p className="eyebrow">THE SERVICES</p>
              <h2>A good place to start.</h2>
            </div>
            <Link href="/services" className="text-link">
              All services <Arrow />
            </Link>
          </div>
          <div className="service-feature-grid">
            <Link href="/services" className="feature-card feature-color">
              <img
                src="/balayage-color.png"
                alt="Brunette hair with warm dimensional color"
                loading="lazy"
              />
              <span className="feature-number">01 — COLOR</span>
              <span className="feature-title">
                Color &amp; highlights <Arrow diagonal />
              </span>
            </Link>
            <Link href="/services" className="feature-card feature-cuts">
              <img
                src="/mens-haircut.png"
                alt="Modern men's haircut inspiration"
                loading="lazy"
              />
              <span className="feature-number">02 — CUT</span>
              <span className="feature-title">
                Cuts for all <Arrow diagonal />
              </span>
            </Link>
            <Link href="/services" className="feature-card feature-straight">
              <img
                src="/sleek-straight.png"
                alt="Long, sleek straight hair"
                loading="lazy"
              />
              <span className="feature-number">03 — TREAT</span>
              <span className="feature-title">
                Straightening <Arrow diagonal />
              </span>
            </Link>
          </div>
        </div>
      </section>

      <section className="at-home section-shell">
        <div className="at-home-image">
          <img
            src="/home-service.png"
            alt="A stylist working with a client at home"
            loading="lazy"
          />
          <span className="image-index">THE JESS EXPERIENCE</span>
        </div>
        <div className="at-home-copy">
          <p className="eyebrow">YOUR HOME, YOUR APPOINTMENT</p>
          <h2>
            Care that comes
            <br />
            <em>to you.</em>
          </h2>
          <p>
            Enjoy a hair appointment in familiar surroundings. Choose a service,
            share your inspiration and ask us anything before confirming a date.
          </p>
          <ul className="benefit-list">
            <li>
              <span>01</span>
              <div>
                <b>Stay in your space</b>
                <small>Have your appointment at home, on your schedule.</small>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <b>Talk it through</b>
                <small>Message ahead to discuss the service you have in mind.</small>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <b>For men &amp; women</b>
                <small>A range of hair services for different styles.</small>
              </div>
            </li>
          </ul>
          <BookingLink className="text-link">Ask about an appointment</BookingLink>
        </div>
      </section>

      <section className="inspiration-strip work-preview-strip">
        <div className="section-shell inspiration-inner">
          <div>
            <p className="eyebrow">JESS SALON AT HOME</p>
            <h2>
              Care that comes
              <br />
              <em>to you.</em>
            </h2>
            <p>
              A glimpse at cuts, color, and polished finishes created for our
              clients, in the comfort of home.
            </p>
            <Link href="/book" className="button button-outline-light">
              Explore our work <Arrow diagonal />
            </Link>
          </div>
          <div className="strip-images work-preview">
            <figure>
              <img
                src="/work/work-5.png"
                alt="Finished hair color and treatment by JESS Salon at Home"
                loading="lazy"
              />
              <figcaption>Soft golden finish</figcaption>
            </figure>
            <figure>
              <img
                src="/work/work-3.png"
                alt="A young client after a fresh haircut by JESS Salon at Home"
                loading="lazy"
              />
              <figcaption>Fresh cut, made personal</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <BookingBand />
    </AppShell>
  );
}
