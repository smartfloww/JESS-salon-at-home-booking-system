'use client';

import { useEffect, useRef, useState } from 'react';
import {
  HAIRCUT_ADDITIONAL_PERSON_PRICE,
  HAIRCUT_FIRST_PERSON_PRICE,
  HAIRCUT_GROUPS,
  HAIRCUT_HOURS_PER_PERSON,
  HAIRCUT_CATEGORY_TITLE,
  MAJOR_CATEGORIES,
  MAJOR_SERVICES,
  findMajorService,
} from '@/lib/catalogue';
import { formatCurrency } from '@/lib/booking';
import { PageIntro } from '@/components/site/ui';

function PriceTable({ rows }: { rows: [string, number, number][] }) {
  return (
    <div className="price-table-wrap">
      <table className="price-table">
        <thead>
          <tr>
            <th>Option / Length</th>
            <th>Price</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([length, price, duration]) => (
            <tr key={length}>
              <td data-label="Option / Length">{length}</td>
              <td data-label="Price">{formatCurrency(price)}</td>
              <td data-label="Duration">{duration} hr{duration > 1 ? 's' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HaircutPriceList() {
  return (
    <ul className="service-price-list">
      <li>
        <span>Haircut rate</span>
        <strong>{formatCurrency(HAIRCUT_FIRST_PERSON_PRICE)}</strong>
      </li>
      <li>
        <span>Additional person</span>
        <strong>+{formatCurrency(HAIRCUT_ADDITIONAL_PERSON_PRICE)}</strong>
      </li>
      <li>
        <span>Duration per person</span>
        <strong>{HAIRCUT_HOURS_PER_PERSON} hr</strong>
      </li>
    </ul>
  );
}

function MajorServiceInfo({ serviceName }: { serviceName: string }) {
  const service = findMajorService(
    MAJOR_SERVICES.find((s) => s.name === serviceName)?.id ?? '',
  );
  if (!service) return null;

  if (service.note) {
    return (
      <div className="service-price-detail">
        <span>{formatCurrency(service.variants[0].price)}</span>
        <small>{service.note}</small>
      </div>
    );
  }

  // Single-variant service → show inline price/duration.
  if (service.variants.length === 1) {
    const v = service.variants[0];
    return (
      <span className="service-price">
        {formatCurrency(v.price)} <small>· {v.durationHours} hr{v.durationHours > 1 ? 's' : ''}</small>
      </span>
    );
  }

  // Multi-variant service → show the price table.
  const rows: [string, number, number][] = service.variants.map((v) => [
    v.label,
    v.price,
    v.durationHours,
  ]);
  return (
    <div className="service-table-block">
      <PriceTable rows={rows} />
    </div>
  );
}

interface CategoryView {
  title: string;
  groups: { heading: string; services: string[] }[];
  isHaircuts?: boolean;
}

const categories: CategoryView[] = [
  {
    title: HAIRCUT_CATEGORY_TITLE,
    isHaircuts: true,
    groups: HAIRCUT_GROUPS.map((g) => ({ heading: g.heading, services: g.services })),
  },
  ...MAJOR_CATEGORIES.map((c) => ({
    title: c.title,
    groups: [{ heading: 'Services', services: c.services }],
  })),
];

function ServiceCategory({ category }: { category: CategoryView }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLElement | null>(null);
  const serviceCount = category.groups.reduce((n, g) => n + g.services.length, 0);

  useEffect(() => {
    if (!isOpen || !ref.current) return;
    const t = window.setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 380);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  return (
    <article
      ref={ref}
      className={`service-category ${isOpen ? 'is-open' : ''}`}
    >
      <button
        type="button"
        className="service-category-header"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
      >
        <span className="category-heading">
          <h3>{category.title}</h3>
          <small>{serviceCount} service{serviceCount !== 1 ? 's' : ''}</small>
        </span>
        <span className="accordion-icon" aria-hidden="true">+</span>
      </button>
      <div className={`accordion-panel ${isOpen ? 'is-open' : ''}`}>
        <div className="accordion-inner">
          {category.groups.map((group) => (
            <div className="category-group" key={group.heading}>
              <h4>{group.heading}</h4>
              <ul className="service-item-list">
                {group.services.map((serviceName) => (
                  <li key={serviceName} className="service-item-row">
                    <span>{serviceName}</span>
                    {category.isHaircuts ? (
                      <span className="service-price">
                        {formatCurrency(HAIRCUT_FIRST_PERSON_PRICE)} <small>· {HAIRCUT_HOURS_PER_PERSON} hr</small>
                      </span>
                    ) : (
                      <MajorServiceInfo serviceName={serviceName} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {category.isHaircuts && (
            <div className="category-group">
              <h4>Haircut pricing</h4>
              <HaircutPriceList />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function ServicesContent() {
  return (
    <main className="page-main">
      <PageIntro
        eyebrow="A MENU OF POSSIBILITIES"
        title={<>Services, <em>made personal.</em></>}
        text="From a fresh cut to a change in color or texture, tell us what you’re considering. We’ll help you find the right service for your hair."
      />
      <section className="services-menu section-shell">
        <div className="menu-aside">
          <span className="eyebrow">THE JESS MENU</span>
          <p>
            Select a category below to explore the full list of services and pricing information.
          </p>
        </div>
        <div className="service-list">
          {categories.map((category) => (
            <ServiceCategory key={category.title} category={category} />
          ))}
        </div>
      </section>
      <section className="service-note section-shell">
        <img
          src="/imgs/stylist-at-work.png"
          alt="Stylist applying color during an at-home appointment"
          loading="lazy"
        />
        <div>
          <p className="eyebrow">BEFORE WE BEGIN</p>
          <h2>Let’s talk about<br /><em>your hair first.</em></h2>
          <p>
            Share your current hair length, color history and a reference photo when you book. We
            can discuss the service details and pricing before confirming a date.
          </p>
        </div>
      </section>
    </main>
  );
}
