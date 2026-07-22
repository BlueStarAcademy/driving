"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type AdminUser = {
  id: string;
  email: string;
  nickname: string | null;
  role: string;
  suspended: boolean;
  createdAt: string;
};

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0 });
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  async function load() {
    const me = await fetch("/api/auth/me");
    if (!me.ok) {
      router.replace("/");
      return;
    }
    const { user } = await me.json();
    if (user.role !== "SUPER_MASTER") {
      setError("슈퍼마스터만 접근할 수 있습니다.");
      setReady(true);
      return;
    }
    const res = await fetch("/api/admin/users");
    if (!res.ok) {
      setError("목록을 불러오지 못했습니다.");
      setReady(true);
      return;
    }
    const data = await res.json();
    setUsers(data.users);
    setStats(data.stats);
    setReady(true);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleSuspend(u: AdminUser) {
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspended: !u.suspended }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "실패");
      return;
    }
    await load();
  }

  if (!ready) {
    return (
      <main className="page">
        <p className="sub">확인 중…</p>
      </main>
    );
  }

  if (error && users.length === 0) {
    return (
      <main className="page">
        <h1>관리자</h1>
        <p className="form-error">{error}</p>
        <Link href="/">홈으로</Link>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>관리자</h1>
      <p className="sub">
        유저 {stats.total}명 · 활성 {stats.active}명
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      <table className="admin-table">
        <thead>
          <tr>
            <th>이메일</th>
            <th>닉네임</th>
            <th>역할</th>
            <th>상태</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.nickname ?? "—"}</td>
              <td>{u.role}</td>
              <td>
                <span className={`badge ${u.suspended ? "warn" : "ok"}`}>
                  {u.suspended ? "정지" : "활성"}
                </span>
              </td>
              <td>
                {u.role !== "SUPER_MASTER" ? (
                  <button type="button" className="btn-ghost" onClick={() => toggleSuspend(u)}>
                    {u.suspended ? "해제" : "정지"}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions" style={{ marginTop: "1.25rem" }}>
        <Link className="btn-ghost" href="/garage">
          차고
        </Link>
      </div>
    </main>
  );
}
