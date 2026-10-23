"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import { IconSparkle, IconBook, IconPlus, IconExternal, IconCheck } from "../icons";

interface Cluster {
  id: string;
  name: string;
  pillarKeyword: string;
  searchVolume: number;
  intent: string;
  status: string;
  notes?: string;
  createdAt: string;
}

interface Post {
  id: string;
  title: string;
  slug: string;
  postType: string;
  seoScore: number;
  status: string;
  focusKeywords: string[];
  publishedAt?: string;
  createdAt: string;
}

interface Site {
  id: string;
  name: string;
  type: string;
  endpointUrl: string;
  authType: string;
  status: string;
  createdAt: string;
}

export default function ContentHubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "clusters";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [sites, setSites] = useState<Site[]>([]);

  // Modal / Form states
  const [showClusterModal, setShowClusterModal] = useState(false);
  const [newCluster, setNewCluster] = useState({ name: "", pillarKeyword: "", searchVolume: 0, intent: "informational" });

  const [showPostModal, setShowPostModal] = useState(false);
  const [newPost, setNewPost] = useState({ title: "", contentMarkdown: "", focusKeywords: "", postType: "cluster" });

  const [showSiteModal, setShowSiteModal] = useState(false);
  const [newSite, setNewSite] = useState({ name: "", type: "wordpress", endpointUrl: "", authType: "application_password" });

  useEffect(() => {
    fetchData();
  }, [slug]);

  async function fetchData() {
    setLoading(true);
    try {
      const [cRes, pRes, sRes] = await Promise.all([
        fetch(`/api/biz/${slug}/content/clusters`).then((r) => r.json()).catch(() => ({ clusters: [] })),
        fetch(`/api/biz/${slug}/content/posts`).then((r) => r.json()).catch(() => ({ posts: [] })),
        fetch(`/api/biz/${slug}/content/sites`).then((r) => r.json()).catch(() => ({ sites: [] })),
      ]);
      setClusters(cRes.clusters || []);
      setPosts(pRes.posts || []);
      setSites(sRes.sites || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCluster(e: React.FormEvent) {
    e.preventDefault();
    if (!newCluster.name || !newCluster.pillarKeyword) return;
    const res = await fetch(`/api/biz/${slug}/content/clusters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newCluster),
    });
    if (res.ok) {
      setShowClusterModal(false);
      setNewCluster({ name: "", pillarKeyword: "", searchVolume: 0, intent: "informational" });
      fetchData();
    }
  }

  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault();
    if (!newPost.title) return;
    const res = await fetch(`/api/biz/${slug}/content/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newPost,
        focusKeywords: newPost.focusKeywords.split(",").map((k) => k.trim()).filter(Boolean),
      }),
    });
    if (res.ok) {
      setShowPostModal(false);
      setNewPost({ title: "", contentMarkdown: "", focusKeywords: "", postType: "cluster" });
      fetchData();
    }
  }

  async function handleCreateSite(e: React.FormEvent) {
    e.preventDefault();
    if (!newSite.name || !newSite.endpointUrl) return;
    const res = await fetch(`/api/biz/${slug}/content/sites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSite),
    });
    if (res.ok) {
      setShowSiteModal(false);
      setNewSite({ name: "", type: "wordpress", endpointUrl: "", authType: "application_password" });
      fetchData();
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--brand)]">
            <IconSparkle size={14} />
            All-In-One Marketing OS
          </div>
          <h1 className="mt-1 text-2xl font-bold text-[var(--ink-900)]">Content & SEO Hub</h1>
          <p className="text-sm text-[var(--ink-500)]">
            Quản lý cụm chủ đề Topical Authority, bài viết tối ưu On-page SEO và đồng bộ đa nền tảng CMS.
          </p>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2">
          {activeTab === "clusters" && (
            <button onClick={() => setShowClusterModal(true)} className="ui-btn-primary flex items-center gap-1.5 text-sm">
              <IconPlus size={16} /> Thêm Cụm chủ đề
            </button>
          )}
          {activeTab === "posts" && (
            <button onClick={() => setShowPostModal(true)} className="ui-btn-primary flex items-center gap-1.5 text-sm">
              <IconPlus size={16} /> Viết bài mới
            </button>
          )}
          {activeTab === "sites" && (
            <button onClick={() => setShowSiteModal(true)} className="ui-btn-primary flex items-center gap-1.5 text-sm">
              <IconPlus size={16} /> Kết nối CMS
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--line)]">
        {[
          { key: "clusters", label: "Cụm chủ đề (Clusters)", count: clusters.length },
          { key: "posts", label: "Bài viết & SEO", count: posts.length },
          { key: "sites", label: "Website CMS", count: sites.length },
          { key: "creative", label: "Ma trận sáng tạo (Creative)" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-[var(--brand)] text-[var(--brand)]"
                : "border-transparent text-[var(--ink-600)] hover:text-[var(--ink-900)]"
            }`}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span className="rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-xs text-[var(--ink-700)]">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab 1: Topic Clusters */}
      {activeTab === "clusters" && (
        <div className="space-y-4">
          {clusters.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--line)] p-8 text-center">
              <IconBook size={32} className="mx-auto text-[var(--ink-300)]" />
              <h3 className="mt-2 text-base font-semibold text-[var(--ink-800)]">Chưa có Cụm chủ đề nào</h3>
              <p className="mt-1 text-xs text-[var(--ink-500)]">
                Xây dựng Topic Clusters (Hub & Spoke) để chiếm lĩnh Topical Authority trên Google.
              </p>
              <button onClick={() => setShowClusterModal(true)} className="ui-btn-primary mt-4 text-xs">
                Tạo Cụm chủ đề đầu tiên
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {clusters.map((c) => (
                <div key={c.id} className="ui-card p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="rounded bg-[var(--brand-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--brand)]">
                        {c.intent.toUpperCase()}
                      </span>
                      <h3 className="mt-1.5 font-bold text-[var(--ink-900)]">{c.name}</h3>
                    </div>
                    <span className="text-xs text-[var(--ink-400)]">{c.status}</span>
                  </div>
                  <div className="rounded-lg bg-[var(--surface-2)] p-2.5 text-xs text-[var(--ink-700)] space-y-1">
                    <div><strong>Từ khóa trụ cột:</strong> {c.pillarKeyword}</div>
                    <div><strong>Volume ước tính:</strong> {c.searchVolume.toLocaleString()} / tháng</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Posts */}
      {activeTab === "posts" && (
        <div className="space-y-4">
          {posts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--line)] p-8 text-center">
              <IconBook size={32} className="mx-auto text-[var(--ink-300)]" />
              <h3 className="mt-2 text-base font-semibold text-[var(--ink-800)]">Chưa có bài viết nào</h3>
              <p className="mt-1 text-xs text-[var(--ink-500)]">
                Viết bài nháp kèm bộ tính điểm On-page SEO thời gian thực và hỗ trợ đẩy tự động.
              </p>
              <button onClick={() => setShowPostModal(true)} className="ui-btn-primary mt-4 text-xs">
                Viết bài đầu tiên
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface-1)]">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--ink-500)]">
                  <tr>
                    <th className="p-3">Tiêu đề bài viết</th>
                    <th className="p-3">Loại</th>
                    <th className="p-3">Điểm On-page SEO</th>
                    <th className="p-3">Trạng thái</th>
                    <th className="p-3 text-right">Ngày tạo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {posts.map((p) => (
                    <tr key={p.id} className="hover:bg-[var(--surface-2)]">
                      <td className="p-3 font-medium text-[var(--ink-900)]">
                        <div>{p.title}</div>
                        <div className="text-xs text-[var(--ink-400)]">/{p.slug}</div>
                      </td>
                      <td className="p-3 text-xs capitalize text-[var(--ink-600)]">{p.postType}</td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            p.seoScore >= 80
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : p.seoScore >= 50
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                          }`}
                        >
                          {p.seoScore}/100
                        </span>
                      </td>
                      <td className="p-3 text-xs font-medium uppercase text-[var(--ink-600)]">{p.status}</td>
                      <td className="p-3 text-right text-xs text-[var(--ink-400)]">
                        {new Date(p.createdAt).toLocaleDateString("vi-VN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Sites CMS */}
      {activeTab === "sites" && (
        <div className="space-y-4">
          {sites.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--line)] p-8 text-center">
              <IconExternal size={32} className="mx-auto text-[var(--ink-300)]" />
              <h3 className="mt-2 text-base font-semibold text-[var(--ink-800)]">Chưa kết nối Website nào</h3>
              <p className="mt-1 text-xs text-[var(--ink-500)]">
                Kết nối website WordPress, Ghost, Webflow hoặc Webhook để xuất bản bài 1-click.
              </p>
              <button onClick={() => setShowSiteModal(true)} className="ui-btn-primary mt-4 text-xs">
                Kết nối Website đầu tiên
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sites.map((s) => (
                <div key={s.id} className="ui-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-[var(--surface-3)] px-2 py-0.5 text-xs font-semibold text-[var(--ink-700)]">
                      {s.type.toUpperCase()}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                      <IconCheck size={12} /> {s.status}
                    </span>
                  </div>
                  <h3 className="font-bold text-[var(--ink-900)]">{s.name}</h3>
                  <div className="truncate text-xs text-[var(--ink-400)]">{s.endpointUrl}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Creative Matrix */}
      {activeTab === "creative" && (
        <div className="ui-card p-6 text-center space-y-3">
          <IconSparkle size={32} className="mx-auto text-[var(--brand)]" />
          <h3 className="text-base font-semibold text-[var(--ink-900)]">Ma trận Sáng tạo & Repurposing đa kênh</h3>
          <p className="max-w-xl mx-auto text-xs text-[var(--ink-500)]">
            Tự động bẻ nhỏ 1 bài viết Pillar/Cluster thành các kịch bản Video ngắn (TikTok/Reels), bài post Facebook/Threads và mẫu quảng cáo chuyển đổi cao theo các framework AIDA, PAS, BAB.
          </p>
        </div>
      )}

      {/* Modal: Thêm Cụm chủ đề */}
      {showClusterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-[var(--surface-1)] p-6 shadow-xl border border-[var(--line)]">
            <h3 className="text-lg font-bold text-[var(--ink-900)]">Thêm Cụm chủ đề (Topic Cluster)</h3>
            <form onSubmit={handleCreateCluster} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-[var(--ink-700)]">Tên cụm chủ đề</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Chăm sóc da treatment"
                  value={newCluster.name}
                  onChange={(e) => setNewCluster({ ...newCluster, name: e.target.value })}
                  className="ui-input mt-1 w-full text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--ink-700)]">Từ khóa trụ cột (Pillar Keyword)</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: cách phục hồi da sau treatment"
                  value={newCluster.pillarKeyword}
                  onChange={(e) => setNewCluster({ ...newCluster, pillarKeyword: e.target.value })}
                  className="ui-input mt-1 w-full text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--ink-700)]">Search Intent</label>
                <select
                  value={newCluster.intent}
                  onChange={(e) => setNewCluster({ ...newCluster, intent: e.target.value })}
                  className="ui-input mt-1 w-full text-sm"
                >
                  <option value="informational">Informational (Cung cấp thông tin)</option>
                  <option value="commercial">Commercial (So sánh / Đánh giá)</option>
                  <option value="transactional">Transactional (Mua hàng / Chuyển đổi)</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowClusterModal(false)} className="ui-btn text-xs">
                  Hủy
                </button>
                <button type="submit" className="ui-btn-primary text-xs">
                  Lưu Cụm chủ đề
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Viết bài mới */}
      {showPostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl bg-[var(--surface-1)] p-6 shadow-xl border border-[var(--line)]">
            <h3 className="text-lg font-bold text-[var(--ink-900)]">Viết bài mới & Tối ưu SEO</h3>
            <form onSubmit={handleCreatePost} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-[var(--ink-700)]">Tiêu đề bài viết</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Hướng dẫn phục hồi da treatment chuẩn y khoa tại nhà"
                  value={newPost.title}
                  onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                  className="ui-input mt-1 w-full text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--ink-700)]">Từ khóa chính (cách nhau bởi dấu phẩy)</label>
                <input
                  type="text"
                  placeholder="phục hồi da treatment, serum b5"
                  value={newPost.focusKeywords}
                  onChange={(e) => setNewPost({ ...newPost, focusKeywords: e.target.value })}
                  className="ui-input mt-1 w-full text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--ink-700)]">Nội dung (Markdown)</label>
                <textarea
                  rows={6}
                  placeholder="## Giới thiệu&#10;Nội dung bài viết..."
                  value={newPost.contentMarkdown}
                  onChange={(e) => setNewPost({ ...newPost, contentMarkdown: e.target.value })}
                  className="ui-input mt-1 w-full font-mono text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowPostModal(false)} className="ui-btn text-xs">
                  Hủy
                </button>
                <button type="submit" className="ui-btn-primary text-xs">
                  Lưu bản nháp
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Kết nối Site CMS */}
      {showSiteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-[var(--surface-1)] p-6 shadow-xl border border-[var(--line)]">
            <h3 className="text-lg font-bold text-[var(--ink-900)]">Kết nối Website CMS</h3>
            <form onSubmit={handleCreateSite} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-[var(--ink-700)]">Tên hiển thị</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Blog chính của tôi"
                  value={newSite.name}
                  onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                  className="ui-input mt-1 w-full text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--ink-700)]">Nền tảng</label>
                <select
                  value={newSite.type}
                  onChange={(e) => setNewSite({ ...newSite, type: e.target.value })}
                  className="ui-input mt-1 w-full text-sm"
                >
                  <option value="wordpress">WordPress (REST API)</option>
                  <option value="ghost">Ghost CMS (Admin API)</option>
                  <option value="webflow">Webflow API</option>
                  <option value="webhook">Custom Webhook Endpoint</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--ink-700)]">URL trang web / REST Endpoint</label>
                <input
                  type="url"
                  required
                  placeholder="https://example.com/wp-json/wp/v2"
                  value={newSite.endpointUrl}
                  onChange={(e) => setNewSite({ ...newSite, endpointUrl: e.target.value })}
                  className="ui-input mt-1 w-full text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowSiteModal(false)} className="ui-btn text-xs">
                  Hủy
                </button>
                <button type="submit" className="ui-btn-primary text-xs">
                  Kết nối ngay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
