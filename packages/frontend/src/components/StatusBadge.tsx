import { CampaignStatus } from '@/types/campaign';

interface StatusBadgeProps {
  status: CampaignStatus;
}

const STATUS_CONFIG: Record<CampaignStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-700' },
  sending: { label: 'Sending', className: 'bg-yellow-100 text-yellow-700' },
  sent: { label: 'Sent', className: 'bg-green-100 text-green-700' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const { label, className } = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}
