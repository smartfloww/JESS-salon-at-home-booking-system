import Link from "next/link";
import { AppShell } from "@/components/site-shell";

const MSG = "https://m.me/61580949253081";
const FB = "https://www.facebook.com/profile.php?id=61580949253081";
const PHONE = "tel:+639977491555";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true">{diagonal ? "↗" : "→"}</span>;
}

export default function AboutPage() {
  return (
    <AppShell>
      <div className="page-main">
        <section className="page-intro">
          <p className="eyebrow">LET&apos;S MAKE A PLAN</p>
          <h1>
            About JESS, <em>made personal.</em>
          </h1>
          <p className="intro-copy">
            JESS Salon at Home brings salon-quality hair services to your door
            across Metro Manila, Cavite, Laguna and Batangas. Get to know how we
            work, how to reach us, and how booking is now simpler than ever.
          </p>
        </section>

        <section className="contact-layout section-shell">
          <div className="contact-lead">
            <p className="eyebrow">BOOKING, MADE SIMPLE</p>
            <h2>
              Choose how
              <br />
              to say <em>hello.</em>
            </h2>
            <p>
              Send a message with the service you have in mind. For color and
              chemical services, include your hair length, current color and any
              inspiration photos.
            </p>
            <img
              src="/home-service.png"
              alt="A stylist working with a client at home"
              loading="lazy"
            />
          </div>

          <div className="contact-options">
            <a
              className="contact-option"
              href={MSG}
              target="_blank"
              rel="noreferrer"
            >
              <span className="contact-number">01</span>
              <span>
                <small>QUICK MESSAGE</small>
                <b>Facebook Messenger</b>
                <em>JESS Salon at Home</em>
              </span>
              <span className="contact-arrow">↗</span>
            </a>
            <a className="contact-option" href={PHONE}>
              <span className="contact-number">02</span>
              <span>
                <small>PREFER A CALL?</small>
                <b>Call JESS</b>
                <em>+63 997 749 1555</em>
              </span>
              <span className="contact-arrow">↗</span>
            </a>

            <div className="contact-facts">
              <div>
                <span className="eyebrow">SERVICE AREA</span>
                <b>Metro Manila · Cavite · Laguna · Batangas</b>
              </div>
              <div>
                <span className="eyebrow">OPENING HOURS</span>
                <b>Daily · 8 AM–6 PM</b>
              </div>
              <p>
                Late-evening appointments should be booked in advance for a
                specific date. Please message us to check availability.
              </p>
            </div>

            <div className="booking-panel">
              <p className="eyebrow">BOOKING &amp; PAYMENT</p>
              <h3>How booking works</h3>
              <p>
                Reserve your appointment online in a few simple steps. Choose
                your service area, pick your services, share your address and
                preferred date, and pay the reservation fee through our secure
                checkout. The reservation fee is deducted from your final bill —
                the remaining balance is paid in cash at your appointment.
              </p>
              <div className="booking-fees">
                <p>
                  <strong>Haircut bookings:</strong> ₱500 reservation fee
                </p>
                <p>
                  <strong>Major service bookings:</strong> ₱1,500 reservation
                  fee
                </p>
              </div>
              <p className="reservation-policy">
                The reservation fee is deducted from the final service bill.
                Reservations are non-refundable for cancellations made within 24
                hours of the appointment to protect the reserved time slot.
              </p>
              <div className="booking-actions" style={{ marginTop: 22 }}>
                <Link href="/book" className="btn btn-gold btn-block">
                  Book your appointment online <Arrow diagonal />
                </Link>
              </div>
            </div>

            <a
              className="facebook-link"
              href={FB}
              target="_blank"
              rel="noreferrer"
            >
              Visit JESS on Facebook <Arrow diagonal />
            </a>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
