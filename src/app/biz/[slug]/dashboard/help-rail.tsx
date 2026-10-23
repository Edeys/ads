import Link from "next/link";
import { IconBook, IconFeedback } from "./icons";

/**
 * Rail nổi bên phải (giống Done.vn): hai tab dọc "Hướng dẫn sử dụng" / "Phản hồi".
 * Chữ xoay dọc bằng writing-mode nên phải đặt trên <span> riêng, không đặt trên
 * container flex (nếu không sẽ bị cắt cụt chữ).
 * Ẩn dưới lg để không che nội dung trên màn hẹp.
 */
export function HelpRail({ slug }: { slug: string }) {
  const tab =
    "flex w-[36px] flex-col items-center gap-1.5 rounded-l-xl border border-r-0 bg-[var(--card)] py-3 transition-colors hover:bg-[var(--surface-3)]";
  const label = "text-[12px] font-semibold tracking-wide";
  return (
    <div className="fixed right-0 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-2 lg:flex">
      <Link
        href={`/biz/${slug}/dashboard/huong-dan`}
        className={tab}
        style={{ borderColor: "var(--line)", color: "var(--ink-600)" }}
        title="Hướng dẫn sử dụng"
      >
        <IconBook size={16} />
        <span className={label} style={{ writingMode: "vertical-rl" }}>
          Hướng dẫn sử dụng
        </span>
      </Link>
      <Link
        href={`/biz/${slug}/dashboard/support`}
        className={tab}
        style={{ borderColor: "var(--line)", color: "var(--ink-600)" }}
        title="Phản hồi"
      >
        <IconFeedback size={16} />
        <span className={label} style={{ writingMode: "vertical-rl" }}>
          Phản hồi
        </span>
      </Link>
    </div>
  );
}
