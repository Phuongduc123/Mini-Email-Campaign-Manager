import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { CreateCampaignPayload } from '@/types/campaign';
import { Recipient } from '@/types/recipient';

interface CampaignFormProps {
  onSubmit: (data: CreateCampaignPayload) => void;
  recipients: Recipient[];
  isSubmitting?: boolean;
  defaultValues?: Partial<CreateCampaignPayload>;
}

export function CampaignForm({
  onSubmit,
  recipients,
  isSubmitting,
  defaultValues,
}: CampaignFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateCampaignPayload>({
    defaultValues: {
      name: defaultValues?.name ?? '',
      subject: defaultValues?.subject ?? '',
      body: defaultValues?.body ?? '',
      recipientIds: defaultValues?.recipientIds ?? [],
    },
  });

  const selectedIds = watch('recipientIds') ?? [];
  const [search, setSearch] = useState('');

  const filteredRecipients = useMemo(
    () =>
      recipients.filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          r.email.toLowerCase().includes(search.toLowerCase()),
      ),
    [recipients, search],
  );

  const toggleRecipient = (id: number) => {
    if (selectedIds.includes(id)) {
      setValue(
        'recipientIds',
        selectedIds.filter((r) => r !== id),
      );
    } else {
      setValue('recipientIds', [...selectedIds, id]);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
        <input
          {...register('name', { required: 'Name is required' })}
          type="text"
          placeholder="e.g. Spring Newsletter"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>

      {/* Subject */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Subject Line</label>
        <input
          {...register('subject', { required: 'Subject is required' })}
          type="text"
          placeholder="e.g. Your spring offers are here!"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {errors.subject && <p className="mt-1 text-xs text-red-600">{errors.subject.message}</p>}
      </div>

      {/* Body */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email Body</label>
        <textarea
          {...register('body', { required: 'Body is required' })}
          rows={6}
          placeholder="Write your email content here..."
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        {errors.body && <p className="mt-1 text-xs text-red-600">{errors.body.message}</p>}
      </div>

      {/* Recipients multi-select */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Recipients ({selectedIds.length} selected)
        </label>
        {recipients.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">
            No recipients available. Create some first.
          </p>
        ) : (
          <div className="border border-gray-300 rounded-md overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full bg-transparent text-sm focus:outline-none placeholder-gray-400"
              />
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
              {filteredRecipients.length === 0 ? (
                <p className="text-sm text-gray-400 px-3 py-3">No recipients match your search.</p>
              ) : (
                filteredRecipients.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(r.id)}
                      onChange={() => toggleRecipient(r.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-800">{r.name}</span>
                    <span className="text-xs text-gray-500">{r.email}</span>
                  </label>
                ))
              )}
            </div>
            {recipients.length > 10 && (
              <div className="px-3 py-1.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
                {filteredRecipients.length} of {recipients.length} recipients
              </div>
            )}
          </div>
        )}
        {errors.recipientIds && (
          <p className="mt-1 text-xs text-red-600">{String(errors.recipientIds.message)}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isSubmitting ? 'Saving...' : 'Create Campaign'}
      </button>
    </form>
  );
}
