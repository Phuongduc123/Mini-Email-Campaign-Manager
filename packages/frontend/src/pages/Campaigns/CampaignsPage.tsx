import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AxiosError } from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { useCampaigns } from '@/hooks/useCampaigns';
import { StatusBadge } from '@/components/StatusBadge';
import { CampaignListSkeleton } from '@/components/LoadingSkeleton';
import { ErrorMessage } from '@/components/ErrorMessage';
import { useAuthStore } from '@/store/auth.store';
import { authApi } from '@/api/auth.api';
import { ApiError } from '@/types/api';

export default function CampaignsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') ?? '1');
  const setPage = (p: number) => setSearchParams({ page: String(p) }, { replace: true });
  const { data, isLoading, isError, error } = useCampaigns({ page, limit: 20 });
  const { user, refreshToken, logout } = useAuthStore();

  const handleLogout = async () => {
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // ignore logout errors
      }
    }
    logout();
    queryClient.clear(); // xóa toàn bộ cache — tránh data của tài khoản cũ hiện với tài khoản mới
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold text-gray-900">Campaign Manager</h1>
          <nav className="flex items-center gap-4 text-sm">
            <span className="text-gray-900 font-medium">Campaigns</span>
            <Link to="/recipients" className="text-gray-500 hover:text-gray-900 transition-colors">
              Recipients
            </Link>
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
          <h2 className="text-2xl font-bold text-gray-900">Campaigns</h2>
          <Link
            to="/campaigns/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + New Campaign
          </Link>
        </div>

        {/* Content */}
        {isLoading ? (
          <CampaignListSkeleton />
        ) : isError ? (
          <ErrorMessage error={error as AxiosError<ApiError>} />
        ) : !data?.data.length ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg font-medium mb-1">No campaigns yet</p>
            <p className="text-sm mb-4">Create your first campaign to get started.</p>
            <Link
              to="/campaigns/new"
              className="inline-block bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Create Campaign
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {data.data.map((campaign) => (
                <div
                  key={campaign.id}
                  className="bg-white rounded-lg border border-gray-200 px-5 py-4 flex items-center justify-between hover:border-gray-300 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-medium text-gray-900 truncate">
                        {campaign.name}
                      </h3>
                      <StatusBadge status={campaign.status} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Created {new Date(campaign.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Link
                    to={`/campaigns/${campaign.id}`}
                    className="ml-4 text-sm text-blue-600 hover:text-blue-800 font-medium shrink-0"
                  >
                    View →
                  </Link>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {data.meta.totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <p className="text-sm text-gray-500">
                  Page {data.meta.page} of {data.meta.totalPages} ({data.meta.total} campaigns)
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
                    disabled={page >= data.meta.totalPages}
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
