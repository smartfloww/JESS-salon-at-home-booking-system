import { BookingForm } from '@/components/booking/booking-form';
import { PageIntro } from '@/components/site/ui';

export default function BookPage() {
  return (
    <main className="page-main">
      <PageIntro
        eyebrow="RESERVE YOUR APPOINTMENT"
        title={<>Book your visit, <em>at home.</em></>}
        text="Choose your services, select your area, pick a time, and pay the reservation fee online. The remaining balance is paid in cash during your appointment."
      />
      <BookingForm />
    </main>
  );
}
