import { useMemo } from 'react';
import {
  BarChart3,
  Download,
  MapPin,
  MessageCircle,
  Package,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import type {
  ActivityLog,
  ChatSession,
  Complaint,
  RbacRoleEntry,
} from '../../types';

interface AdminReportsPanelProps {
  complaints: Complaint[];
  chatSessions: ChatSession[];
  staffRoles: RbacRoleEntry[];
  recentActivities: ActivityLog[];
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escapeCell = (val: string | number) => {
    const s = String(val ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csvContent = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ].join('\n');

  const blob = new Blob([`\uFEFF${csvContent}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AdminReportsPanel({
  complaints,
  chatSessions,
  staffRoles,
  recentActivities,
}: AdminReportsPanelProps) {
  const {
    allProducts,
    allCategories,
    allOccasions,
    allShowrooms,
    allHeroBanners,
    hasPermission,
  } = useStore();

  const activeProducts = useMemo(
    () => allProducts.filter((p) => !p.deleted),
    [allProducts]
  );

  const categoryBreakdown = useMemo(() => {
    return allCategories
      .filter((c) => !c.deleted)
      .map((cat) => {
        const items = activeProducts.filter((p) => p.category === cat.slug);
        const visibleCount = items.filter((p) => p.visible !== false).length;
        return {
          id: cat.id,
          name: cat.name,
          nameEn: cat.nameEn,
          total: items.length,
          visible: visibleCount,
          featured: items.filter((p) => p.featured).length,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [allCategories, activeProducts]);

  const availabilityStats = useMemo(() => {
    const counts: Record<string, number> = {
      'In Showroom': 0,
      'Pre-Order at Showroom': 0,
      Seasonal: 0,
      'Out of Stock': 0,
    };
    activeProducts.forEach((p) => {
      counts[p.availability] = (counts[p.availability] || 0) + 1;
    });
    return Object.entries(counts);
  }, [activeProducts]);

  const complaintStats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    complaints.forEach((c) => {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    });
    return {
      total: complaints.length,
      open: complaints.filter((c) =>
        ['New', 'Reviewing', 'In Progress'].includes(c.status)
      ).length,
      resolved: complaints.filter((c) =>
        ['Resolved', 'Closed'].includes(c.status)
      ).length,
      byStatus: Object.entries(byStatus),
    };
  }, [complaints]);

  const exportProductsCsv = () => {
    const headers = [
      'ID',
      'Name (BN)',
      'Name (EN)',
      'Category',
      'Price (BDT)',
      'Availability',
      'Visible',
      'Featured',
    ];
    const rows = activeProducts.map((p) => [
      p.id,
      p.name,
      p.nameEn,
      p.categoryNameEn || p.categoryName,
      p.price,
      p.availability,
      p.visible !== false ? 'Yes' : 'Hidden',
      p.featured ? 'Yes' : 'No',
    ]);
    downloadCsv('home-recipe-foods-products-report.csv', headers, rows);
  };

  const exportComplaintsCsv = () => {
    const headers = [
      'Reference',
      'Customer',
      'Phone',
      'Category',
      'Showroom',
      'Status',
      'Priority',
    ];
    const rows = complaints.map((c) => [
      c.referenceCode,
      c.customerName,
      c.phone,
      c.category,
      c.showroomName,
      c.status,
      c.priority || 'Normal',
    ]);
    downloadCsv('home-recipe-foods-complaints-report.csv', headers, rows);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Operations &amp; Catalog Reports
          </h2>
          <p className="text-xs text-[#57534E]">
            পণ্য ক্যাটালগ, শোরুম কভারেজ, অভিযোগ সমাধান এবং স্টাফ/ম্যানেজার কার্যক্রম রিপোর্ট।
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportProductsCsv}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3.5 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#DC1F26]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Catalog CSV</span>
          </button>
          {hasPermission('complaints_manage') && (
            <button
              type="button"
              onClick={exportComplaintsCsv}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#1C1917] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Complaints CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Top Report Metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-[#E7E5E4] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#78716C]">
            <span>Active Catalog</span>
            <Package className="h-4 w-4 text-[#DC1F26]" />
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#1C1917]">
            {activeProducts.length}
          </p>
          <p className="mt-0.5 text-[11px] text-[#57534E]">
            {allOccasions.filter((o) => !o.deleted).length} occasions ·{' '}
            {allHeroBanners.filter((b) => !b.deleted).length} banners
          </p>
        </div>

        <div className="rounded-xl border border-[#E7E5E4] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#78716C]">
            <span>Showrooms</span>
            <MapPin className="h-4 w-4 text-[#1C1917]" />
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#1C1917]">
            {allShowrooms.filter((s) => !s.deleted).length}
          </p>
          <p className="mt-0.5 text-[11px] text-[#57534E]">
            {allShowrooms.filter((s) => s.visible !== false && !s.deleted).length} active branches
          </p>
        </div>

        <div className="rounded-xl border border-[#E7E5E4] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#78716C]">
            <span>Complaints</span>
            <ShieldAlert className="h-4 w-4 text-[#DC1F26]" />
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#1C1917]">
            {complaintStats.total}
          </p>
          <p className="mt-0.5 text-[11px] text-[#57534E]">
            {complaintStats.open} open · {complaintStats.resolved} resolved
          </p>
        </div>

        <div className="rounded-xl border border-[#E7E5E4] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#78716C]">
            <span>Live Chats</span>
            <MessageCircle className="h-4 w-4 text-emerald-700" />
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#1C1917]">
            {chatSessions.length}
          </p>
          <p className="mt-0.5 text-[11px] text-[#57534E]">
            {chatSessions.filter((s) => s.status !== 'closed').length} active sessions
          </p>
        </div>

        <div className="rounded-xl border border-[#E7E5E4] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#78716C]">
            <span>Staff Registry</span>
            <Users className="h-4 w-4 text-[#1C1917]" />
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#1C1917]">
            {staffRoles.length}
          </p>
          <p className="mt-0.5 text-[11px] text-[#57534E]">
            {staffRoles.filter((r) => r.role === 'manager').length} managers ·{' '}
            {recentActivities.length} recent logs
          </p>
        </div>
      </div>

      {/* Category Distribution + Availability Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-[#E7E5E4] bg-white p-5 lg:col-span-7">
          <div className="flex items-center gap-2 border-b border-[#F5F4F0] pb-3">
            <BarChart3 className="h-4 w-4 text-[#DC1F26]" />
            <h3 className="text-sm font-bold text-[#1C1917]">
              Products by Category
            </h3>
          </div>
          <div className="mt-4 space-y-3">
            {categoryBreakdown.map((row) => {
              const pct =
                activeProducts.length > 0
                  ? Math.round((row.total / activeProducts.length) * 100)
                  : 0;
              return (
                <div key={row.id} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#1C1917]">
                      {row.name}{' '}
                      <span className="font-normal text-[#78716C]">
                        ({row.nameEn})
                      </span>
                    </span>
                    <span className="font-mono font-semibold text-[#1C1917]">
                      {row.total} items ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#F5F4F0]">
                    <div
                      className="h-full rounded-full bg-[#DC1F26]"
                      style={{ width: `${Math.max(4, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6 lg:col-span-5">
          <div className="rounded-xl border border-[#E7E5E4] bg-white p-5">
            <h3 className="border-b border-[#F5F4F0] pb-3 text-sm font-bold text-[#1C1917]">
              Product Availability Status
            </h3>
            <div className="mt-3 divide-y divide-[#F5F4F0] text-xs">
              {availabilityStats.map(([label, count]) => (
                <div key={label} className="flex items-center justify-between py-2.5">
                  <span className="font-medium text-[#44403C]">{label}</span>
                  <span className="rounded bg-[#FAFAF8] px-2.5 py-0.5 font-mono font-bold text-[#1C1917]">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {hasPermission('complaints_manage') && (
            <div className="rounded-xl border border-[#E7E5E4] bg-white p-5">
              <h3 className="border-b border-[#F5F4F0] pb-3 text-sm font-bold text-[#1C1917]">
                Complaints Breakdown
              </h3>
              {complaintStats.byStatus.length === 0 ? (
                <p className="mt-3 text-xs text-[#78716C]">
                  কোনো অভিযোগ রেকর্ড পাওয়া যায়নি।
                </p>
              ) : (
                <div className="mt-3 divide-y divide-[#F5F4F0] text-xs">
                  {complaintStats.byStatus.map(([status, count]) => (
                    <div
                      key={status}
                      className="flex items-center justify-between py-2.5"
                    >
                      <span className="font-medium text-[#44403C]">{status}</span>
                      <span className="rounded bg-red-50 px-2.5 py-0.5 font-mono font-bold text-[#DC1F26]">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
