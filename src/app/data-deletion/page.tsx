import type { Metadata } from 'next';
import { DataDeletionInstructions } from '@/components/data-deletion-instructions';

export const metadata: Metadata = {
  title: 'Data deletion instructions | GG-O',
  description: 'How to contact GG-O to request deletion of your account or Facebook Login data.',
};

export default function DataDeletionPage() {
  return <DataDeletionInstructions />;
}
