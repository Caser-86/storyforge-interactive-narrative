"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectSizePreset } from "@/lib/authoring/schemas";
import { createProject } from "./authoring-api";

type Preset = {
  label: string;
  description: string;
  nodes: [number, number];
  endings: [number, number];
  defaults: [number, number];
};

const presets: Record<ProjectSizePreset, Preset> = {
  micro: { label: "微型", description: "适合验证一个小型分支结构", nodes: [8, 15], endings: [2, 3], defaults: [8, 2] },
  short: { label: "短篇", description: "适合完成一轮完整的互动叙事", nodes: [15, 30], endings: [3, 6], defaults: [24, 4] },
  medium: { label: "中篇", description: "适合容纳多条路线与更完整的世界观", nodes: [40, 80], endings: [5, 10], defaults: [48, 6] },
  custom: { label: "自定义", description: "在正式项目范围内自行控制规模", nodes: [8, 80], endings: [2, 10], defaults: [24, 4] },
};

type FormState = {
  title: string;
  premise: string;
  genre: string;
  tone: string;
  pointOfView: string;
  rating: string;
  preset: ProjectSizePreset;
  targetNodes: string;
  targetEndings: string;
};

const initialForm: FormState = {
  title: "",
  premise: "",
  genre: "",
  tone: "",
  pointOfView: "",
  rating: "PG-13",
  preset: "short",
  targetNodes: "24",
  targetEndings: "4",
};

function rangeText(preset: Preset): string {
  return `${preset.nodes[0]}–${preset.nodes[1]} 个节点 · ${preset.endings[0]}–${preset.endings[1]} 个结局`;
}

export function ProjectBriefForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdMessage, setCreatedMessage] = useState(false);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setSubmitError(null);
  }

  function selectPreset(preset: ProjectSizePreset) {
    const next = presets[preset];
    setForm((current) => ({
      ...current,
      preset,
      targetNodes: String(next.defaults[0]),
      targetEndings: String(next.defaults[1]),
    }));
    setErrors({});
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    const requiredFields: Array<[keyof FormState, string]> = [
      ["title", "项目名称"],
      ["premise", "核心设定"],
      ["genre", "类型"],
      ["tone", "基调"],
      ["pointOfView", "叙事视角"],
    ];

    for (const [field, label] of requiredFields) {
      if (!form[field].trim()) next[field] = `${label}不能为空`;
    }

    const selectedPreset = presets[form.preset];
    const targetNodes = Number(form.targetNodes);
    const targetEndings = Number(form.targetEndings);
    if (!Number.isInteger(targetNodes) || targetNodes < selectedPreset.nodes[0] || targetNodes > selectedPreset.nodes[1]) {
      next.targetNodes = `目标节点数需要在 ${selectedPreset.nodes[0]}–${selectedPreset.nodes[1]} 之间`;
    }
    if (!Number.isInteger(targetEndings) || targetEndings < selectedPreset.endings[0] || targetEndings > selectedPreset.endings[1]) {
      next.targetEndings = `目标结局数需要在 ${selectedPreset.endings[0]}–${selectedPreset.endings[1]} 之间`;
    }

    return next;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const project = await createProject({
        title: form.title.trim(),
        premise: form.premise.trim(),
        genre: form.genre.trim(),
        tone: form.tone.trim(),
        pointOfView: form.pointOfView.trim(),
        rating: form.rating,
        size: {
          preset: form.preset,
          targetNodes: Number(form.targetNodes),
          targetEndings: Number(form.targetEndings),
        },
      });
      setCreatedMessage(true);
      router.push(`/projects/${project.id}/generate`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "创建失败，请稍后重试");
      setIsSubmitting(false);
    }
  }

  const selectedPreset = presets[form.preset];

  return (
    <form className="brief-form" onSubmit={handleSubmit} noValidate>
      <div className="brief-form-section">
        <div className="form-section-heading">
          <span className="form-section-number">01</span>
          <div>
            <h2>项目简报</h2>
            <p>先确定作品的边界，生成器只会在这份简报允许的范围内展开。</p>
          </div>
        </div>
        <div className="form-fields">
          <label className="form-field form-field-wide" htmlFor="project-title">
            <span>项目名称</span>
            <input id="project-title" value={form.title} onChange={(event) => updateField("title", event.target.value)} aria-invalid={Boolean(errors.title)} />
            {errors.title ? <small role="alert">{errors.title}</small> : null}
          </label>
          <label className="form-field form-field-wide" htmlFor="project-premise">
            <span>核心设定</span>
            <textarea id="project-premise" value={form.premise} onChange={(event) => updateField("premise", event.target.value)} aria-invalid={Boolean(errors.premise)} rows={4} />
            <small className="field-hint">一句话写清楚主角、困境和最初的牵引力。</small>
            {errors.premise ? <small role="alert">{errors.premise}</small> : null}
          </label>
          <label className="form-field" htmlFor="project-genre">
            <span>类型</span>
            <input id="project-genre" value={form.genre} onChange={(event) => updateField("genre", event.target.value)} placeholder="例如：悬疑奇幻" aria-invalid={Boolean(errors.genre)} />
            {errors.genre ? <small role="alert">{errors.genre}</small> : null}
          </label>
          <label className="form-field" htmlFor="project-tone">
            <span>基调</span>
            <input id="project-tone" value={form.tone} onChange={(event) => updateField("tone", event.target.value)} placeholder="例如：克制、潮湿" aria-invalid={Boolean(errors.tone)} />
            {errors.tone ? <small role="alert">{errors.tone}</small> : null}
          </label>
          <label className="form-field" htmlFor="project-point-of-view">
            <span>叙事视角</span>
            <input id="project-point-of-view" value={form.pointOfView} onChange={(event) => updateField("pointOfView", event.target.value)} placeholder="例如：第三人称限知" aria-invalid={Boolean(errors.pointOfView)} />
            {errors.pointOfView ? <small role="alert">{errors.pointOfView}</small> : null}
          </label>
          <label className="form-field" htmlFor="project-rating">
            <span>内容分级</span>
            <select id="project-rating" value={form.rating} onChange={(event) => updateField("rating", event.target.value)}>
              <option value="G">G · 普遍适宜</option>
              <option value="PG">PG · 轻度主题</option>
              <option value="PG-13">PG-13 · 青少年以上</option>
              <option value="R">R · 成人主题</option>
            </select>
          </label>
        </div>
      </div>

      <div className="brief-form-section">
        <div className="form-section-heading">
          <span className="form-section-number">02</span>
          <div>
            <h2>作品规模</h2>
            <p>先选一个可控的范围。后续可以在编辑器里继续修改，不会无限扩张。</p>
          </div>
        </div>
        <fieldset className="preset-grid">
          <legend className="sr-only">选择作品规模</legend>
          {(Object.keys(presets) as ProjectSizePreset[]).map((preset) => (
            <label className={`preset-option ${form.preset === preset ? "preset-option-selected" : ""}`} key={preset}>
              <input
                type="radio"
                name="size-preset"
                value={preset}
                checked={form.preset === preset}
                onChange={() => selectPreset(preset)}
              />
              <span className="preset-option-copy">
                <strong>{presets[preset].label}</strong>
                <small>{presets[preset].description}</small>
                <em>{rangeText(presets[preset])}</em>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="form-fields form-fields-size">
          <label className="form-field" htmlFor="target-nodes">
            <span>目标节点数</span>
            <input id="target-nodes" type="number" min={selectedPreset.nodes[0]} max={selectedPreset.nodes[1]} value={form.targetNodes} onChange={(event) => updateField("targetNodes", event.target.value)} aria-invalid={Boolean(errors.targetNodes)} />
            {errors.targetNodes ? <small role="alert">{errors.targetNodes}</small> : null}
          </label>
          <label className="form-field" htmlFor="target-endings">
            <span>目标结局数</span>
            <input id="target-endings" type="number" min={selectedPreset.endings[0]} max={selectedPreset.endings[1]} value={form.targetEndings} onChange={(event) => updateField("targetEndings", event.target.value)} aria-invalid={Boolean(errors.targetEndings)} />
            {errors.targetEndings ? <small role="alert">{errors.targetEndings}</small> : null}
          </label>
          <p className="size-note">当前范围：{rangeText(selectedPreset)}。规模越大，生成和后续审阅所需时间越长。</p>
        </div>
      </div>

      {submitError ? <p className="form-submit-error" role="alert">{submitError}</p> : null}
      {createdMessage ? <p className="form-success" role="status">项目已建立，正在进入生成流程…</p> : null}
      <div className="brief-form-actions">
        <p>创建后会先保存项目简报，不会立即调用模型。</p>
        <button className="button button-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "建立中…" : "创建项目"} <span aria-hidden="true">↗</span>
        </button>
      </div>
    </form>
  );
}
