import { CampaignRecipientEntry, RecipientStatus } from '@/types/campaign';

interface RecipientTableProps {
  recipients: CampaignRecipientEntry[];
}

const RECIPIENT_STATUS_CONFIG: Record<RecipientStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Sent', className: 'bg-green-100 text-green-700' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-700' },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString();
}

export function RecipientTable({ recipients }: RecipientTableProps) {
  if (recipients.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        No recipients assigned to this campaign.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Email
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Sent At
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Opened At
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {recipients.map((entry) => {
            const { label, className } = RECIPIENT_STATUS_CONFIG[entry.status];
            return (
              <tr key={`${entry.campaignId}-${entry.recipientId}`} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-800">
                  {entry.recipient?.name ?? '—'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {entry.recipient?.email ?? `Recipient #${entry.recipientId}`}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}
                  >
                    {label}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{formatDate(entry.sentAt)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{formatDate(entry.openedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
