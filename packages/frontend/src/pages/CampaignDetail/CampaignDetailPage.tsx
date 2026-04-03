import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AxiosError } from 'axios';
import { useCampaign } from '@/hooks/useCampaign';
import { useCampaignStats } from '@/hooks/useCampaignStats';
import { useSendCampaign } from '@/hooks/useSendCampaign';
import { useScheduleCampaign } from '@/hooks/useScheduleCampaign';
import { useDeleteCampaign } from '@/hooks/useDeleteCampaign';
import { StatusBadge } from '@/components/StatusBadge';
import { StatsBar } from '@/components/StatsBar';
import { RecipientTable } from '@/components/RecipientTable';
import { ErrorMessage } from '@/components/ErrorMessage';
import { CampaignDetailSkeleton } from '@/components/LoadingSkeleton';
import { ApiError } from '@/types/api';

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const campaignId = Number(id);

  const { data: campaign, isLoading, isError, error } = useCampaign(campaignId);
  const { data: stats } = useCampaignStats(campaignId, campaign?.status);
  const { mutate: send, isPending: isSending, error: sendError } = useSendCampaign(campaignId);
  const { mutate: schedule, isPending: isScheduling, error: scheduleError } =
    useScheduleCampaign(campaignId);
  const { mutate: deleteCampaign, isPending: isDeleting } = useDeleteCampaign();

  const [showScheduleInput, setShowScheduleInput] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduleValidationError, setScheduleValidationError] = useState('');

  const handleSend = () => {
    if (!window.confirm('Send this campaign now? This cannot be undone.')) return;
    send();
  };

  const handleDelete = () => {
    if (!window.confirm('Delete this campaign? This cannot be undone.')) return;
    deleteCampaign(campaignId, {
      onSuccess: () => navigate('/campaigns'),
    });
  };

  const handleScheduleSubmit = () => {
    if (!scheduledAt) {
      setScheduleValidationError('Please select a date and time.');
      return;
    }
    const selected = new Date(scheduledAt);
    if (selected <= new Date()) {
      setScheduleValidationError('Scheduled time must be in the future.');
      return;
    }
    setScheduleValidationError('');
    schedule(
      { scheduledAt: selected.toISOString() },
      { onSuccess: () => setShowScheduleInput(false) },
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <CampaignDetailSkeleton />
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 max-w-4xl mx-auto">
        <Link to="/campaigns" className="text-sm text-gray-500 hover:text-gray-700">
          ← Back
        </Link>
        <div className="mt-6">
          <ErrorMessage error={error as AxiosError<ApiError>} />
        </div>
      </div>
    );
  }

  const actionError = sendError ?? scheduleError;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <Link to="/campaigns" className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to Campaigns
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Title row */}
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-900">{campaign.name}</h2>
          <StatusBadge status={campaign.status} />
        </div>

        {/* Error feedback */}
        {actionError && <ErrorMessage error={actionError as AxiosError<ApiError>} />}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 items-center">
          {campaign.status === 'sending' && (
            <p className="text-sm text-yellow-600 font-medium py-1">
              Sending in progress...
            </p>
          )}

          {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
            <button
              onClick={handleSend}
              disabled={isSending}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSending ? 'Sending...' : 'Send Now'}
            </button>
          )}

          {campaign.status === 'draft' && (
            <>
              <button
                onClick={() => setShowScheduleInput((v) => !v)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors"
              >
                Schedule
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-white border border-red-300 text-red-600 text-sm font-medium rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </>
          )}
        </div>

        {/* Schedule input */}
        {showScheduleInput && campaign.status === 'draft' && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Schedule for</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {scheduleValidationError && (
                <p className="text-xs text-red-600 mt-1">{scheduleValidationError}</p>
              )}
            </div>
            <button
              onClick={handleScheduleSubmit}
              disabled={isScheduling}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isScheduling ? 'Scheduling...' : 'Confirm Schedule'}
            </button>
            <button
              onClick={() => setShowScheduleInput(false)}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Stats */}
        {stats && <StatsBar stats={stats} />}

        {/* Campaign details */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Details</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium text-gray-600">Subject: </span>
              <span className="text-gray-800">{campaign.subject}</span>
            </div>
            {campaign.scheduledAt && (
              <div>
                <span className="font-medium text-gray-600">Scheduled: </span>
                <span className="text-gray-800">
                  {new Date(campaign.scheduledAt).toLocaleString()}
                </span>
              </div>
            )}
            <div>
              <span className="font-medium text-gray-600">Created: </span>
              <span className="text-gray-800">{new Date(campaign.createdAt).toLocaleString()}</span>
            </div>
          </div>
          <div>
            <p className="font-medium text-gray-600 text-sm mb-1">Body:</p>
            <pre className="whitespace-pre-wrap text-sm text-gray-800 bg-gray-50 rounded p-3 border border-gray-100 font-sans">
              {campaign.body}
            </pre>
          </div>
        </div>

        {/* Recipients */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Recipients
          </h3>
          <RecipientTable recipients={campaign.campaignRecipients ?? []} />
        </div>
      </main>
    </div>
  );
}
