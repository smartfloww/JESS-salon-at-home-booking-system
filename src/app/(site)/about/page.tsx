import { PageIntro, BookingBand } from '@/components/site/ui';
import { BUSINESS } from '@/lib/catalogue';
import { SERVICE_AREAS } from '@/lib/catalogue';

export default function AboutPage() {
  return (
    <main className="page-main">
      <PageIntro
        eyebrow="LET’S MAKE A PLAN"
        title={<>About JESS, <em>at home.</em></>}
        text="JESS Salon at Home brings salon-quality hair services to your door. Based in Batasan Hills, Quezon City, JESS travels across Metro Manila and nearby provinces — so you can enjoy a hair appointment in the comfort of your own space."
      />

      <section className="contact-layout section-shell">
        <div className="contact-lead">
          <p className="eyebrow">BOOKING, MADE SIMPLE</p>
          <h2>Choose how<br />to say <em>hello.</em></h2>
          <p>
            Send a message with the service you have in mind. For color and chemical services,
            include your hair length, current color and any inspiration photos. You can also book
            online and reserve your slot with a reservation fee.
          </p>
          <img
            src="/imgs/home-service.png"
            alt="A stylist working with a client at home"
            loading="lazy"
          />
        </div>

        <div className="contact-options">
          <a className="contact-option" href={BUSINESS.messenger} target="_blank" rel="noreferrer">
            <span className="contact-number">01</span>
            <span>
              <small>QUICK MESSAGE</small>
              <b>Facebook Messenger</b>
              <em>JESS Salon at Home</em>
            </span>
            <span className="contact-arrow">↗</span>
          </a>
          <a className="contact-option" href={BUSINESS.phoneHref}>
            <span className="contact-number">02</span>
            <span>
              <small>PREFER A CALL?</small>
              <b>Call JESS</b>
              <em>{BUSINESS.phone}</em>
            </span>
            <span className="contact-arrow">↗</span>
          </a>
          <a className="contact-option" href={BUSINESS.whatsapp} target="_blank" rel="noreferrer">
            <span className="contact-number">03</span>
            <span>
              <small>CHAT</small>
              <b>WhatsApp</b>
              <em>{BUSINESS.phone}</em>
            </span>
            <span className="contact-arrow">↗</span>
          </a>

          <div className="contact-facts">
            <div>
              <span className="eyebrow">SERVICE AREAS</span>
              <b>Metro Manila · Cavite · Laguna · Batangas</b>
            </div>
            <div>
              <span className="eyebrow">OPENING HOURS</span>
              <b>{BUSINESS.workingHours}</b>
            </div>
            <div>
              <span className="eyebrow">BASE</span>
              <b>{BUSINESS.base}</b>
            </div>
            <p>
              Travel time is added to each appointment based on your area. The time you select when
              booking is when JESS leaves her base — not her arrival time.
            </p>
          </div>

          <div className="booking-panel">
            <p className="eyebrow">BOOKING &amp; PAYMENT</p>
            <h3>Reserve your slot online</h3>
            <p>
              Book through this website and reserve your appointment with a reservation fee via
              PayRex secure checkout. The reservation fee is deducted from the total service bill,
              and the remaining balance is paid in cash during the appointment.
            </p>
            <div className="booking-fees">
              <p>
                <strong>Haircut bookings:</strong> {''}
                ₱500 reservation fee per person
              </p>
              <p>
                <strong>Major service bookings:</strong> {''}
                ₱500 per service under ₱1,500; ₱1,500 per service at ₱1,500 or more
              </p>
            </div>
            <p className="reservation-policy">
              <strong>The reservation fee is non-refundable.</strong> Book online to lock in your
              preferred date and time.
            </p>
          </div>
        </div>
      </section>

      <BookingBand>Book your appointment</BookingBand>
    </main>
  );
}
