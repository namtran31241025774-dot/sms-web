import type { Metadata } from "next";
import { all } from "@/lib/db";
import { ROLE_LABEL, type Role } from "@/lib/domain";
import { Icon, type IconName } from "@/components/icons";
import { Persona } from "@/components/ui";
import { ShowcaseCarousel, type ShowcaseSlide } from "@/components/showcase-carousel";
import { loginAction, passwordLoginAction } from "./actions";

export const metadata: Metadata = { title: "Đăng nhập" };
export const dynamic = "force-dynamic";

// Thứ tự và mô tả theo bảng các bên liên quan đã chốt (DEC-30).
const ROLE_ORDER: Role[] = ["SALES", "SALES_MANAGER", "PRESALES", "FINANCE", "DELIVERY", "ADMIN"];

const ROLE_DESC: Record<Role, string> = {
  SALES: "Khách hàng, cơ hội, báo giá, đơn hàng",
  SALES_MANAGER: "Giám sát đội ngũ, rà soát giải pháp, duyệt giao dịch",
  PRESALES: "Khảo sát nhu cầu, hồ sơ giải pháp, kiểm tra cấu hình",
  FINANCE: "Hóa đơn, thanh toán, công nợ",
  DELIVERY: "Nhận bàn giao, cập nhật tiến độ và kết quả triển khai",
  ADMIN: "Tài khoản, phân quyền, cấu hình và giám sát AI Agent",
};

// Ảnh chụp thật từ hệ thống (public/showcase), chụp lại khi giao diện đổi.
const SLIDES: ShowcaseSlide[] = [
  { src: "/showcase/home.jpg", title: "Tổng quan", caption: "Pipeline, Lead, đề xuất AI, công nợ" },
  { src: "/showcase/lead-bant.jpg", title: "Đánh giá khách hàng", caption: "BANT 0/8/15/25 kèm lý do và căn cứ" },
  { src: "/showcase/pipeline.jpg", title: "Phễu cơ hội", caption: "Kanban theo 5 giai đoạn" },
  { src: "/showcase/develop-flow.jpg", title: "Phát triển cơ hội", caption: "Luồng 9 bước, việc tiếp theo, người làm" },
  { src: "/showcase/research.jpg", title: "Sales Opportunity Agent", caption: "Nghiên cứu có căn cứ, người xác minh" },
  { src: "/showcase/solution.jpg", title: "Hồ sơ kỹ thuật", caption: "Phương án, tệp đính kèm, duyệt chuyên môn" },
  { src: "/showcase/propose-flow.jpg", title: "Đề xuất giải pháp", caption: "6 bước từ báo giá tới quyết định khách" },
  { src: "/showcase/quote.jpg", title: "Báo giá theo phiên bản", caption: "Chiết khấu, duyệt giá, phản hồi khách" },
  { src: "/showcase/approvals.jpg", title: "Phê duyệt", caption: "Cổng duyệt của con người" },
  { src: "/showcase/reports.jpg", title: "Báo cáo và Dự báo", caption: "Dự báo quý so với chỉ tiêu" },
  { src: "/showcase/agents.jpg", title: "Trung tâm AI Agent", caption: "Quy tắc, công cụ, lần chạy" },
  { src: "/showcase/invoices.jpg", title: "Hóa đơn và thanh toán", caption: "Đối soát, công nợ, nhắc nợ" },
];

const PROCESS: { icon: IconName; title: string; text: string }[] = [
  { icon: "lead", title: "Đánh giá khách hàng", text: "Tiếp nhận Lead, chấm BANT, quyết định chuyển đổi." },
  { icon: "opportunity", title: "Phát triển cơ hội", text: "Khảo sát, giải pháp sơ bộ, bên liên quan, đối thủ." },
  { icon: "quote", title: "Đề xuất giải pháp", text: "Báo giá theo phiên bản, duyệt giá, thương lượng." },
  { icon: "order", title: "Tạo đơn hàng", text: "Đơn hàng từ báo giá đã chấp thuận, bàn giao triển khai." },
  { icon: "invoice", title: "Hóa đơn và thanh toán", text: "Lập hóa đơn, đối soát, theo dõi công nợ." },
];

export default function LoginPage() {
  const demoLogin = process.env.SMS_DEMO_LOGIN === "true";
  const users = demoLogin ? all<{ id: number; name: string; email: string; role: Role; title: string | null }>(
    "SELECT id, name, email, role, title FROM users WHERE active = 1 AND status = 'ACTIVE' ORDER BY id",
  ) : [];
  const sorted = [...users].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

  return (
    <div className="min-h-full overflow-y-auto bg-[#f4f6fb]">
      {/* HERO tối, ánh xanh */}
      <section className="relative overflow-hidden bg-[#050b1f] text-white">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,rgba(15,108,189,0.45),transparent_65%)]" />
        <div className="pointer-events-none absolute -left-40 top-64 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(79,107,237,0.25),transparent_65%)]" />

        <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-[15px] font-bold shadow-[0_0_24px_rgba(15,108,189,0.6)]">S</span>
            <span className="text-[17px] font-bold">SMS <span className="text-[#5aa9ff]">Sales Hub</span></span>
          </div>
          <nav className="hidden items-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-1 text-sm md:flex">
            <a href="#quy-trinh" className="rounded-xl px-4 py-2 text-[#c9d6ef] hover:bg-white/10 hover:text-white">Quy trình</a>
            <a href="#agent" className="rounded-xl px-4 py-2 text-[#c9d6ef] hover:bg-white/10 hover:text-white">AI Agent</a>
            <a href="#dang-nhap" className="rounded-xl bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-hover">Đăng nhập →</a>
          </nav>
        </header>

        <div className="relative mx-auto max-w-6xl px-6 pb-6 pt-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2b4f8f] bg-[#0b1a3d] px-4 py-1.5 text-sm text-[#c9d6ef] shadow-[0_0_20px_rgba(15,108,189,0.25)]">
            <Icon name="sparkle" size={15} className="text-[#5aa9ff]" /> Bán hàng B2B SaaS · 2 AI Agent · con người quyết định
          </span>
          <h1 className="mt-6 max-w-4xl text-[40px] font-extrabold leading-[1.08] tracking-tight sm:text-[56px]">
            Quản lý bán hàng B2B, có AI Agent đồng hành ở từng bước
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-7 text-[#a9b8d6]">
            Từ đánh giá khách hàng tới thu tiền trong một hệ thống. Agent nghiên cứu và đề xuất có căn cứ, nhân viên xác minh, quản lý duyệt ở các cổng kiểm soát.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#dang-nhap" className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-6 font-semibold shadow-[0_8px_24px_rgba(15,108,189,0.45)] hover:bg-brand-hover">
              Vào hệ thống <Icon name="arrowRight" size={16} />
            </a>
            <a href="#quy-trinh" className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/20 px-6 font-semibold hover:bg-white/5">
              Xem quy trình
            </a>
          </div>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-[#c9d6ef]">
            {["5 quy trình bán hàng", "6 vai trò", "Quy tắc nghiệp vụ có căn cứ", "Cổng duyệt của con người"].map((c) => (
              <span key={c} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{c}</span>
            ))}
          </div>
        </div>

        <div className="relative pb-10 pt-6">
          <ShowcaseCarousel slides={SLIDES} />
          <p className="mt-2 text-center text-xs text-[#7f93bb]">Kéo hoặc vuốt để lướt các màn hình</p>
        </div>
      </section>

      {/* QUY TRÌNH */}
      <section id="quy-trinh" className="mx-auto max-w-6xl scroll-mt-6 px-6 py-16">
        <div className="text-xs font-bold uppercase tracking-[0.12em] text-brand">Quy trình xuyên suốt</div>
        <h2 className="mt-2 max-w-2xl text-[32px] font-bold leading-tight text-brand-ink">Năm giai đoạn, một hồ sơ giao dịch</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {PROCESS.map((p, i) => (
            <div key={p.title} className="rounded-2xl border border-stroke bg-white p-5 shadow-[var(--shadow-4)]">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-tint text-brand"><Icon name={p.icon} size={22} /></span>
                <span className="text-sm font-bold text-[#c4cede]">0{i + 1}</span>
              </div>
              <div className="mt-4 font-bold text-brand-ink">{p.title}</div>
              <p className="mt-1 text-sm text-ink-3">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AI AGENT */}
      <section id="agent" className="scroll-mt-6 bg-white py-16">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 lg:grid-cols-2">
          {[
            { title: "Sales Qualification Agent", tag: "Đánh giá khách hàng", items: ["Nghiên cứu Lead, bổ sung thông tin có nguồn", "Đề xuất điểm BANT kèm lý do", "Soạn email nháp hỏi thông tin còn thiếu"], who: "Nhân viên kinh doanh duyệt trước khi dùng" },
            { title: "Sales Opportunity Agent", tag: "Phát triển cơ hội", items: ["Tổng hợp bối cảnh, nhu cầu, bên liên quan, đối thủ", "Kiểm ngân sách và 10 quy tắc nghiệp vụ", "Tối đa 3 hành động ưu tiên, mỗi hành động có căn cứ"], who: "Nhân viên xác minh, Quản lý kinh doanh rà soát" },
          ].map((a) => (
            <div key={a.title} className="rounded-2xl border border-stroke bg-[#f8fafd] p-7">
              <span className="rounded-full bg-brand-tint px-3 py-1 text-xs font-semibold text-brand">{a.tag}</span>
              <h3 className="mt-4 text-[22px] font-bold text-brand-ink">{a.title}</h3>
              <ul className="mt-4 space-y-2 text-sm text-ink-2">
                {a.items.map((it) => (
                  <li key={it} className="flex gap-2"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-brand" />{it}</li>
                ))}
              </ul>
              <p className="mt-5 border-t border-stroke pt-4 text-xs font-semibold text-ink-3">{a.who}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ĐĂNG NHẬP */}
      <section id="dang-nhap" className="scroll-mt-6 px-6 py-16">
        <div className="mx-auto w-full max-w-[540px] rounded-2xl border border-stroke bg-white p-8 shadow-[var(--shadow-16)]">
          <h2 className="text-[24px] font-bold text-brand-ink">Đăng nhập hệ thống</h2>
          <p className="mb-6 mt-1 text-sm text-ink-3">Chọn một vai trò để vào đúng giao diện của vai trò đó.</p>

          {/* Chọn nhân viên là vào thẳng giao diện của vai trò đó */}
          {demoLogin && (
            <ul className="-mx-2 mb-4 space-y-1">
              {sorted.map((u) => (
                <li key={u.id}>
                  <form action={loginAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-brand-tint">
                      <Persona name={u.name} sub={`${ROLE_LABEL[u.role] || u.role} · ${ROLE_DESC[u.role] || u.email}`} size={38} />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <details open={!demoLogin}>
            <summary className="mb-3 cursor-pointer text-xs font-medium text-ink-3">Đăng nhập bằng email và mật khẩu</summary>
            {/* Form đăng nhập email + mật khẩu (DEC-14, FR-97) */}
            <form action={async (fd: FormData) => {
              "use server";
              await passwordLoginAction(undefined, fd);
            }} className="mb-6 space-y-4">
              <div>
                <label className="label">Email</label>
                <input name="email" type="email" placeholder="ten@sms.local" required className="input" />
              </div>
              <div>
                <label className="label">Mật khẩu</label>
                <input name="password" type="password" placeholder="••••••••" required className="input" />
              </div>
              <button type="submit" className="btn btn-primary w-full">Đăng nhập</button>
            </form>
          </details>

          <div className="mt-6 border-t border-stroke pt-4 text-[11px] text-ink-3">
            Mật khẩu mã hoá bằng scrypt, phiên ký HMAC SHA-256, quyền kiểm ở server.
          </div>
        </div>
      </section>
    </div>
  );
}
