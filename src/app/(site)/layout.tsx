import { SiteFooter, SiteHeader } from '@/components/site/site-chrome';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-root" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SiteHeader />
      <div style={{ flex: 1 }}>{children}</div>
      <SiteFooter />
    </div>
  );
}
