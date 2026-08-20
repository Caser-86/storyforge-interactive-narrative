import Link from "next/link";
import { ProjectBriefForm } from "@/features/authoring/project-brief-form";

export default function NewProjectPage() {
  return (
    <main className="authoring-shell">
      <div className="authoring-container brief-page">
        <header className="authoring-header">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">SF</span>
            <div>
              <p className="eyebrow">NEW PROJECT / BRIEF</p>
              <p className="brand-name">建立一份可持续编辑的作品</p>
            </div>
          </div>
          <Link className="text-link" href="/">返回项目库</Link>
        </header>
        <section className="brief-intro">
          <p className="eyebrow">PROJECT SETUP / 02</p>
          <h1>先把边界写下来。</h1>
          <p>好的互动叙事不是一次生成，而是一份可以反复校准的结构。项目简报会成为后续生成、编辑和验证的共同依据。</p>
        </section>
        <ProjectBriefForm />
      </div>
    </main>
  );
}
