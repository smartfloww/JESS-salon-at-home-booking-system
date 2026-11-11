import Link from 'next/link';
import { BookingBand, BookingLink } from '@/components/site/ui';

const workImg = (name: string) => `/imgs/work/${name}.png`;
const img = (name: string) => `/imgs/${name}.png`;

export default function Home() {
  return (
    <main>
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
            <span>MEN &amp; WOMEN</span>
            <span>METRO MANILA</span>
          </div>
        </div>
        <div className="hero-image-wrap">
          <img
            src={img('hero-hair')}
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
            Make time for the style you want, without leaving the place you feel most at ease. JESS
            brings hair services to your home, with a personal conversation before every
            appointment.
          </p>
          <Link href="/services" className="text-link">
            Explore our services <span aria-hidden="true">→</span>
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
              All services <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="service-feature-grid">
            <Link href="/services" className="feature-card feature-color">
              <img
                src={img('balayage-color')}
                alt="Brunette hair with warm dimensional color"
                loading="lazy"
              />
              <span className="feature-number">01 — COLOR</span>
              <span className="feature-title">
                Color &amp; highlights <span aria-hidden="true">↗</span>
              </span>
            </Link>
            <Link href="/services" className="feature-card feature-cuts">
              <img
                src={img('mens-haircut')}
                alt="Modern men's haircut inspiration"
                loading="lazy"
              />
              <span className="feature-number">02 — CUT</span>
              <span className="feature-title">
                Cuts for all <span aria-hidden="true">↗</span>
              </span>
            </Link>
            <Link href="/services" className="feature-card feature-straight">
              <img
                src={img('sleek-straight')}
                alt="Long, sleek straight hair"
                loading="lazy"
              />
              <span className="feature-number">03 — TREAT</span>
              <span className="feature-title">
                Straightening <span aria-hidden="true">↗</span>
              </span>
            </Link>
          </div>
        </div>
      </section>

      <section className="at-home section-shell">
        <div className="at-home-image">
          <img
            src={img('home-service')}
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
            Enjoy a hair appointment in familiar surroundings. Choose a service, share your
            inspiration and ask us anything before confirming a date.
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
              A glimpse at cuts, color, and polished finishes created for our clients, in the
              comfort of home.
            </p>
            <Link href="/about" className="button button-outline-light">
              Learn about JESS <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="strip-images work-preview">
            <figure>
              <img
                src={workImg('work-5')}
                alt="Finished hair color and treatment by JESS Salon at Home"
                loading="lazy"
              />
              <figcaption>Soft golden finish</figcaption>
            </figure>
            <figure>
              <img
                src={workImg('work-3')}
                alt="A young client after a fresh haircut by JESS Salon at Home"
                loading="lazy"
              />
              <figcaption>Fresh cut, made personal</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <BookingBand />
    </main>
  );
}
