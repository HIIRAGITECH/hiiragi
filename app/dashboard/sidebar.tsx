"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  jp: string;
  href: string;
  ct?: number | null;
  /** active 判定で startsWith を使うか（一覧→詳細などで同じ active を維持したい場合） */
  prefix?: boolean;
};

type NavGroup = { group: string; items: NavItem[] };

type Props = {
  userEmail: string | null;
  isAdmin: boolean;
  counts: {
    orders: number;
    payments: number;
    partsAlert: number;
  };
  signOutAction: () => Promise<void>;
};

export default function Sidebar({
  userEmail,
  isAdmin,
  counts,
  signOutAction,
}: Props) {
  const pathname = usePathname();

  const groups: NavGroup[] = [
    {
      group: "業務",
      items: [
        { jp: "ダッシュボード", href: "/dashboard" },
        {
          jp: "受注一覧",
          href: "/dashboard/orders",
          ct: counts.orders,
          prefix: true,
        },
        {
          jp: "顧客管理",
          href: "/dashboard/customers",
          prefix: true,
        },
      ],
    },
    {
      group: "会計",
      items: [
        {
          jp: "入金管理",
          href: "/dashboard/payments",
          ct: counts.payments,
        },
        { jp: "売上集計", href: "/dashboard/sales" },
      ],
    },
    {
      group: "工房",
      items: [
        {
          jp: "作業メニュー",
          href: "/dashboard/work-menus",
          prefix: true,
        },
        {
          jp: "作業セット",
          href: "/dashboard/work-menu-sets",
          prefix: true,
        },
        {
          jp: "部品在庫",
          href: "/dashboard/parts-inventory",
          ct: counts.partsAlert > 0 ? counts.partsAlert : null,
          prefix: true,
        },
        {
          jp: "カテゴリ管理",
          href: "/dashboard/work-item-categories",
          prefix: true,
        },
      ],
    },
    {
      group: "システム",
      items: [{ jp: "設定", href: "/dashboard/settings" }],
    },
  ];

  if (isAdmin) {
    groups.push({
      group: "管理者",
      items: [{ jp: "管理者", href: "/dashboard/admin" }],
    });
  }

  function isActive(item: NavItem) {
    if (item.prefix) return pathname.startsWith(item.href);
    return pathname === item.href;
  }

  return (
    <aside className="wos-sidebar no-print">
      <div className="wos-sidebar-brand">
        <Link
          href="/dashboard"
          className="wos-wm block no-underline"
          style={{ color: "inherit" }}
        >
          HIIRAGI <em>TECH</em>
        </Link>
        <span className="wos-sub">工房管理システム</span>
      </div>
      <nav className="wos-sidebar-nav">
        {groups.map((g) => (
          <div key={g.group}>
            <div className="wos-sidebar-grp">{g.group}</div>
            {g.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={`wos-sidebar-link ${isActive(it) ? "active" : ""}`}
              >
                <span>{it.jp}</span>
                {it.ct != null && <span className="wos-ct">{it.ct}</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="wos-sidebar-foot">
        {userEmail && (
          <>
            <span className="wos-user-sub" title={userEmail}>
              {userEmail.length > 22
                ? `${userEmail.slice(0, 20)}…`
                : userEmail}
            </span>
          </>
        )}
        <form action={signOutAction}>
          <button type="submit" className="wos-signout w-full">
            ログアウト
          </button>
        </form>
      </div>
    </aside>
  );
}
