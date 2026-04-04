import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CampaignRecipientEntry, RecipientStatus } from '@/types/campaign';

interface RecipientTableProps {
  recipients: CampaignRecipientEntry[];
}

const RECIPIENT_STATUS_CONFIG: Record<RecipientStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Sent', className: 'bg-green-100 text-green-700' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-700' },
};

const ROW_HEIGHT = 53;
const MAX_VISIBLE_ROWS = 10;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString();
}

export function RecipientTable({ recipients }: RecipientTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: recipients.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  if (recipients.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        No recipients assigned to this campaign.
      </div>
    );
  }

  const containerHeight = Math.min(recipients.length * ROW_HEIGHT, MAX_VISIBLE_ROWS * ROW_HEIGHT);

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      {/* Fixed header */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="grid grid-cols-[2fr_2fr_1fr_1.5fr_1.5fr] px-4 py-3">
          {['Name', 'Email', 'Status', 'Sent At', 'Opened At'].map((h) => (
            <span key={h} className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {h}
            </span>
          ))}
        </div>
      </div>

      {/* Virtualised rows — only renders visible rows in DOM */}
      <div
        ref={parentRef}
        style={{ height: containerHeight, overflowY: 'auto' }}
        className="bg-white"
      >
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const entry = recipients[virtualRow.index];
            const { label, className } = RECIPIENT_STATUS_CONFIG[entry.status];

            return (
              <div
                key={`${entry.campaignId}-${entry.recipientId}`}
                style={{
                  position: 'absolute',
                  top: virtualRow.start,
                  left: 0,
                  right: 0,
                  height: ROW_HEIGHT,
                }}
                className="grid grid-cols-[2fr_2fr_1fr_1.5fr_1.5fr] items-center px-4 border-b border-gray-100 hover:bg-gray-50"
              >
                <span className="text-sm text-gray-800 truncate pr-2">
                  {entry.recipient?.name ?? '—'}
                </span>
                <span className="text-sm text-gray-600 truncate pr-2">
                  {entry.recipient?.email ?? `Recipient #${entry.recipientId}`}
                </span>
                <span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}
                  >
                    {label}
                  </span>
                </span>
                <span className="text-sm text-gray-500">{formatDate(entry.sentAt)}</span>
                <span className="text-sm text-gray-500">{formatDate(entry.openedAt)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {recipients.length > MAX_VISIBLE_ROWS && (
        <div className="bg-gray-50 border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
          {recipients.length.toLocaleString()} recipients — scroll to view all
        </div>
      )}
    </div>
  );
}
