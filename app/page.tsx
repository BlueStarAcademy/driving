import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getSessionUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) {
    if (!user.nickname && user.role !== "SUPER_MASTER") {
      redirect("/onboarding");
    }
    redirect("/garage");
  }

  return (
    <main className="hero-screen">
      <div className="hero-panel">
        <h1 className="brand">
          DRIV<span>ING</span>
        </h1>
        <p className="lede">한국 도로를 브라우저에서 연습하세요. 설치 가능한 PWA.</p>
        <AuthForm />
      </div>
    </main>
  );
}
