"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/nickname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "실패했습니다.");
        return;
      }
      router.push("/garage");
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <h1>닉네임</h1>
      <p className="sub">연습 화면에 표시될 이름을 정하세요.</p>
      <form className="stack-form" onSubmit={onSubmit}>
        <label>
          닉네임
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={16}
            required
            placeholder="예: 여의도초보"
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn-primary" disabled={loading}>
          {loading ? "저장 중…" : "계속"}
        </button>
      </form>
    </main>
  );
}
