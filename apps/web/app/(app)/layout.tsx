import { PartnerShell } from '@/components/PartnerShell';
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <PartnerShell>{children}</PartnerShell>;
}
