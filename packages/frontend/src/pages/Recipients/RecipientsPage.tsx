import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { AxiosError } from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { useRecipients } from '@/hooks/useRecipients';
import { useCreateRecipient } from '@/hooks/useCreateRecipient';
import { useAuthStore } from '@/store/auth.store';
import { authApi } from '@/api/auth.api';
import { ErrorMessage } from '@/components/ErrorMessage';
import { ApiError } from '@/types/api';
import { CreateRecipientPayload } from '@/types/recipient';

// ── Add Recipient Modal ────────────────────────────────────────────────────────

interface AddRecipientModalProps {
  onClose: () => void;
}

function AddRecipientModal({ onClose }: AddRecipientModalProps) {
  const { mutateAsync, isPending } = useCreateRecipient();
  const [apiError, setApiError] = useState<AxiosError<ApiError> | null>(null);

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
      setApiError(err as AxiosError<ApiError>);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-lg w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Add Recipient</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {apiError && <ErrorMessage error={apiError} />}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
            <input
              {...register('name', { required: 'Name is required' })}
              type="text"
              placeholder="Alice Smith"
              autoFocus
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email address' },
              })}
              type="email"
              placeholder="alice@example.com"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? 'Adding...' : 'Add Recipient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── RecipientsPage ─────────────────────────────────────────────────────────────

export default function RecipientsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');

  const page = Number(searchParams.get('page') ?? '1');
  const setPage = (p: number) => setSearchParams({ page: String(p) }, { replace: true });

  const { data, isLoading, isError, error } = useRecipients(page, 20);
  const { user, refreshToken, logout } = useAuthStore();

  const handleLogout = async () => {
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // ignore
      }
    }
    logout();
    queryClient.clear();
    navigate('/login');
  };

  const filtered = (data?.data ?? []).filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {showModal && <AddRecipientModal onClose={() => setShowModal(false)} />}

      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold text-gray-900">Campaign Manager</h1>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/campaigns" className="text-gray-500 hover:text-gray-900 transition-colors">
              Campaigns
            </Link>
            <span className="text-gray-900 font-medium">Recipients</span>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Recipients</h2>
            {data && (
              <p className="text-sm text-gray-500 mt-0.5">{data.meta.total} total</p>
            )}
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Add Recipient
          </button>
        </div>

        {/* Search */}
        {!isLoading && !isError && (data?.data.length ?? 0) > 0 && (
          <div className="mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full max-w-sm border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 px-5 py-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-40 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-56" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorMessage error={error as AxiosError<ApiError>} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            {search ? (
              <p className="text-sm">No recipients match "<strong>{search}</strong>"</p>
            ) : (
              <>
                <p className="text-lg font-medium mb-1">No recipients yet</p>
                <p className="text-sm mb-4">Add your first recipient to get started.</p>
                <button
                  onClick={() => setShowModal(true)}
                  className="inline-block bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Add Recipient
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="bg-gray-50 border border-gray-200 rounded-t-lg px-5 py-3 grid grid-cols-[2fr_2fr_1fr] text-xs font-medium text-gray-500 uppercase tracking-wider">
              <span>Name</span>
              <span>Email</span>
              <span>Added</span>
            </div>

            {/* Rows */}
            <div className="border-x border-b border-gray-200 rounded-b-lg divide-y divide-gray-100 bg-white">
              {filtered.map((recipient) => (
                <div
                  key={recipient.id}
                  className="grid grid-cols-[2fr_2fr_1fr] items-center px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-900 truncate pr-4">
                    {recipient.name}
                  </span>
                  <span className="text-sm text-gray-600 truncate pr-4">{recipient.email}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(recipient.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {(data?.meta.totalPages ?? 1) > 1 && !search && (
              <div className="flex items-center justify-between mt-6">
                <p className="text-sm text-gray-500">
                  Page {data!.meta.page} of {data!.meta.totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page >= data!.meta.totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
