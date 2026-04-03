import { useNavigate, Link } from 'react-router-dom';
import { AxiosError } from 'axios';
import { useCreateCampaign } from '@/hooks/useCreateCampaign';
import { useRecipients } from '@/hooks/useRecipients';
import { CampaignForm } from '@/components/CampaignForm';
import { ErrorMessage } from '@/components/ErrorMessage';
import { FormSkeleton } from '@/components/LoadingSkeleton';
import { CreateCampaignPayload } from '@/types/campaign';
import { ApiError } from '@/types/api';

export default function NewCampaignPage() {
  const navigate = useNavigate();
  const { data: recipientsData, isLoading: loadingRecipients } = useRecipients();
  const { mutateAsync: createCampaign, isPending, error: createError } = useCreateCampaign();

  const handleSubmit = async (data: CreateCampaignPayload) => {
    const created = await createCampaign(data);
    navigate(`/campaigns/${created.id}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <Link to="/campaigns" className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to Campaigns
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">New Campaign</h2>

        {createError && (
          <div className="mb-5">
            <ErrorMessage error={createError as AxiosError<ApiError>} />
          </div>
        )}

        {loadingRecipients ? (
          <FormSkeleton />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <CampaignForm
              onSubmit={handleSubmit}
              recipients={recipientsData?.data ?? []}
              isSubmitting={isPending}
            />
          </div>
        )}
      </main>
    </div>
  );
}
