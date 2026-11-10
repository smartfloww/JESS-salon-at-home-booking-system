"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/site-shell";
import {
  formatPHP,
  formatDuration,
  type ServiceDTO,
  type ServiceGroupDTO,
} from "@/lib/types";

const MSG = "https://m.me/61580949253081";

// Haircuts are a flat ₱999 / 1 hr regardless of which named cut.
const HAIRCUT_BASE_PRICE = 99900; // ₱999 in centavos
const HAIRCUT_BASE_DURATION = 60; // 1 hr in minutes

// Subgroup structure for the Haircuts group (matches the original site).
const HAIRCUT_NAMES_MEN = new Set(["Classic Haircut", "Modern Haircut"]);
const HAIRCUT_NAMES_WOMEN = new Set([
  "Pixie Cut",
  "Bob Cut",
  "Bixie Cut",
  "Wolf Cut",
  "Layered Cut",
  "Curtain Bangs",
]);

const haircutPricing = [
  { label: "Haircut rate", value: "₱999" },
  { label: "Additional person", value: "+₱500" },
];

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true">{diagonal ? "↗" : "→"}</span>;
}

function BookingLink({
  children,
  href = "/book",
  className = "button button-gold",
  external = false,
}: {
  children: React.ReactNode;
  href?: string;
  className?: string;
  external?: boolean;
}) {
  if (external) {
    return (
      <a href={href} className={className} target="_blank" rel="noreferrer">
        {children} <Arrow diagonal />
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
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

function PriceTable({ rows }: { rows: Array<[string, string, string]> }) {
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
              <td data-label="Price">{price}</td>
              <td data-label="Duration">{duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderServiceInfo(service: ServiceDTO) {
  // Hair Color Correction — special block with note + duration.
  if (service.slug === "hair-color-correction") {
    return (
      <div className="service-price-detail">
        <span>{formatPHP(service.basePrice)}</span>
        <small>{service.note}</small>
        <small className="service-duration">
          Duration: up to {formatDuration(service.baseDuration)}
        </small>
      </div>
    );
  }

  // Haircuts — flat rate within the Haircuts group; actual price for toupee/blending.
  if (service.category === "haircut") {
    if (service.group === "Haircuts") {
      return (
        <span className="service-price">
          {formatPHP(HAIRCUT_BASE_PRICE)}{" "}
          <small>· {formatDuration(HAIRCUT_BASE_DURATION)}</small>
        </span>
      );
    }
    return (
      <span className="service-price">
        {formatPHP(service.basePrice)}{" "}
        <small>· {formatDuration(service.baseDuration)}</small>
      </span>
    );
  }

  // Major services with variants — render the price table.
  if (service.variants.length > 0) {
    const rows: Array<[string, string, string]> = service.variants.map((v) => [
      v.name,
      formatPHP(v.price),
      formatDuration(v.duration),
    ]);
    return (
      <div className="service-table-block">
        <PriceTable rows={rows} />
      </div>
    );
  }

  // Major services without variants — show base price · base duration.
  return (
    <span className="service-price">
      {formatPHP(service.basePrice)}{" "}
      <small>· {formatDuration(service.baseDuration)}</small>
    </span>
  );
}

interface Subgroup {
  heading: string;
  items: ServiceDTO[];
}

function getSubgroups(group: ServiceGroupDTO): Subgroup[] {
  if (group.group === "Haircuts") {
    const men = group.items.filter((i) => HAIRCUT_NAMES_MEN.has(i.name));
    const women = group.items.filter((i) => HAIRCUT_NAMES_WOMEN.has(i.name));
    const extra = group.items.filter(
      (i) => !HAIRCUT_NAMES_MEN.has(i.name) && !HAIRCUT_NAMES_WOMEN.has(i.name),
    );
    return [
      { heading: "For Men", items: men },
      { heading: "For Women", items: women },
      { heading: "Additional haircut options", items: extra },
    ].filter((sg) => sg.items.length > 0);
  }
  return [{ heading: "Services", items: group.items }];
}

export default function ServicesPage() {
  const [groups, setGroups] = useState<ServiceGroupDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCategory, setOpenCategory] = useState("");
  const categoryRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/services")
      .then((r) => r.json())
      .then((data: { groups: ServiceGroupDTO[] }) => {
        if (cancelled) return;
        setGroups(data.groups || []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleCategory = (title: string) => {
    setOpenCategory((current) => (current === title ? "" : title));
  };

  useEffect(() => {
    if (!openCategory) return;
    const timeoutId = window.setTimeout(() => {
      categoryRefs.current[openCategory]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 380);
    return () => window.clearTimeout(timeoutId);
  }, [openCategory]);

  return (
    <AppShell>
      <div className="page-main">
        <section className="page-intro">
          <p className="eyebrow">A MENU OF POSSIBILITIES</p>
          <h1>
            Services, <em>made personal.</em>
          </h1>
          <p className="intro-copy">
            From a fresh cut to a change in color or texture, tell us what
            you&apos;re considering. We&apos;ll help you inquire about the right
            service for your hair.
          </p>
        </section>

        <section className="services-menu section-shell">
          <div className="menu-aside">
            <span className="eyebrow">THE JESS MENU</span>
            <p>
              Select a category below to explore the full list of services and
              pricing information.
            </p>
          </div>
          <div className="service-list">
            {loading ? (
              <p className="empty-state">Loading services…</p>
            ) : groups.length === 0 ? (
              <p className="empty-state">No services available.</p>
            ) : (
              groups.map((group) => {
                const isOpen = openCategory === group.group;
                const subgroups = getSubgroups(group);
                const totalServices = group.items.length;
                return (
                  <article
                    key={group.group}
                    ref={(el) => {
                      categoryRefs.current[group.group] = el;
                    }}
                    className={`service-category ${isOpen ? "is-open" : ""}`}
                  >
                    <button
                      type="button"
                      className="service-category-header"
                      onClick={() => toggleCategory(group.group)}
                      aria-expanded={isOpen}
                    >
                      <span className="category-heading">
                        <h3>{group.group}</h3>
                        <small>
                          {totalServices} service
                          {totalServices === 1 ? "" : "s"}
                        </small>
                      </span>
                      <span className="accordion-icon" aria-hidden="true">
                        +
                      </span>
                    </button>
                    <div
                      className={`accordion-panel ${isOpen ? "is-open" : ""}`}
                    >
                      <div className="accordion-inner">
                        {subgroups.map((sg) => (
                          <div className="category-group" key={sg.heading}>
                            <h4>{sg.heading}</h4>
                            <ul className="service-item-list">
                              {sg.items.map((service) => (
                                <li
                                  key={service.id}
                                  className="service-item-row"
                                >
                                  <span>{service.name}</span>
                                  {renderServiceInfo(service)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                        {group.group === "Haircuts" && (
                          <div className="category-group">
                            <h4>Haircut pricing</h4>
                            <ul className="service-price-list">
                              {haircutPricing.map((item) => (
                                <li key={item.label}>
                                  <span>{item.label}</span>
                                  <strong>{item.value}</strong>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="service-note section-shell">
          <img
            src="/stylist-at-work.png"
            alt="Stylist applying color during an at-home appointment"
            loading="lazy"
          />
          <div>
            <p className="eyebrow">BEFORE WE BEGIN</p>
            <h2>
              Let&apos;s talk about
              <br />
              <em>your hair first.</em>
            </h2>
            <p>
              Share your current hair length, color history and a reference
              photo when you inquire. We can discuss the service details and
              pricing before you book.
            </p>
            <BookingLink href={MSG} external>
              Message JESS
            </BookingLink>
          </div>
        </section>

        <BookingBand />
      </div>
    </AppShell>
  );
}
