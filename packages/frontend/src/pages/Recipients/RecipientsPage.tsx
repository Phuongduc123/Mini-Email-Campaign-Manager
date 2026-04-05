import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { AxiosError } from 'axios';
import { useRecipients } from '@/hooks/useRecipients';
import { useCreateRecipient } from '@/hooks/useCreateRecipient';
import { AppLayout } from '@/components/AppLayout';
import { ErrorMessage } from '@/components/ErrorMessage';
import { ApiError } from '@/types/api';
import { CreateRecipientPayload } from '@/types/recipient';

// ── Add Recipient Modal ────────────────────────────────────────────────────────

interface AddRecipientModalProps {
  onClose: () => void;
}

function AddRecipientModal({ onClose }: AddRecipientModalProps) {
  const { mutateAsync, isPending } = useCreateRecipient();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateRecipientPayload>();

  const onSubmit = async (data: CreateRecipientPayload) => {
    setApiError(null);
    try {
      await mutateAsync(data);
      onClose();
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError>;
      setApiError(axiosErr.response?.data?.message ?? 'Something went wrong. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Add Recipient</h2>
            <p className="text-xs text-slate-500 mt-0.5">Add a new contact to your list</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* API error */}
          {apiError && (
            <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-100 px-3.5 py-3 text-sm text-red-700">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {apiError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
              <input
                {...register('name', { required: 'Name is required' })}
                type="text"
                placeholder="Alice Smith"
                autoFocus
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
              />
              {errors.name && (
                <p className="mt-1.5 text-xs text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
              <input
                {...register('email', {
                  required: 'Email is required',
                  pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email address' },
                })}
                type="email"
                placeholder="alice@example.com"
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? 'Adding…' : 'Add Recipient'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── RecipientsPage ─────────────────────────────────────────────────────────────

export default function RecipientsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');

  const page = Number(searchParams.get('page') ?? '1');
  const setPage = (p: number) => setSearchParams({ page: String(p) }, { replace: true });

  const { data, isLoading, isError, error } = useRecipients(page, 20);

  const filtered = (data?.data ?? []).filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <AppLayout>
      {showModal && <AddRecipientModal onClose={() => setShowModal(false)} />}

      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Recipients</h2>
          {data && (
            <p className="text-sm text-slate-500 mt-0.5">{data.meta.total} total</p>
          )}
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Recipient
        </button>
      </div>

      {/* Search */}
      {!isLoading && !isError && (data?.data.length ?? 0) > 0 && (
        <div className="mb-4 relative max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full border border-slate-200 rounded-lg pl-9 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
          />
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 px-5 py-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-slate-200 rounded w-32" />
                  <div className="h-3 bg-slate-100 rounded w-48" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <ErrorMessage error={error as AxiosError<ApiError>} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          {search ? (
            <>
              <h3 className="text-base font-semibold text-slate-900 mb-1">No results found</h3>
              <p className="text-sm text-slate-500">
                No recipients match "<span className="font-medium">{search}</span>"
              </p>
            </>
          ) : (
            <>
              <h3 className="text-base font-semibold text-slate-900 mb-1">No recipients yet</h3>
              <p className="text-sm text-slate-500 mb-6 max-w-xs">
                Add your first recipient to start building your audience.
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Recipient
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            {/* Table header */}
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 grid grid-cols-[auto_2fr_2fr_1fr] gap-4 items-center">
              <div className="w-8" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</span>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</span>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Added</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-slate-100 bg-white">
              {filtered.map((recipient) => {
                const initials = recipient.name
                  ? recipient.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
                  : recipient.email[0].toUpperCase();

                return (
                  <div
                    key={recipient.id}
                    className="grid grid-cols-[auto_2fr_2fr_1fr] gap-4 items-center px-5 py-3.5 hover:bg-slate-50 transition-colors"
                  >
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center select-none shrink-0">
                      {initials}
                    </div>
                    <span className="text-sm font-medium text-slate-900 truncate">{recipient.name}</span>
                    <span className="text-sm text-slate-500 truncate">{recipient.email}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(recipient.createdAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pagination */}
          {(data?.meta.totalPages ?? 1) > 1 && !search && (
            <div className="flex items-center justify-between mt-8">
              <p className="text-sm text-slate-500">
                Page <span className="font-medium text-slate-700">{data!.meta.page}</span> of {data!.meta.totalPages}
                <span className="ml-1 text-slate-400">({data!.meta.total} recipients)</span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  ← Previous
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= data!.meta.totalPages}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
