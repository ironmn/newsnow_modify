import type { PressSectionConfig, PressSectionResult } from "@shared/press"
import { PRESS_WORDS_PER_MINUTE } from "@shared/press"

export interface EditableSection extends PressSectionConfig {
  prompt: string
  durationMinutes: number
}

interface Props {
  section: EditableSection
  loading?: boolean
  result?: PressSectionResult
  onPromptChange: (id: EditableSection["id"], prompt: string) => void
  onDurationChange: (id: EditableSection["id"], duration: number) => void
}

export function PressSectionCard({ section, onPromptChange, onDurationChange, loading, result }: Props) {
  const targetWords = Math.round(section.durationMinutes * PRESS_WORDS_PER_MINUTE)

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-base p-4 shadow-sm flex flex-col gap-4">
      <header className="flex flex-wrap gap-3 justify-between items-start">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span className="i-ph:film-slate-duotone text-primary" />
            <span>{section.title}</span>
          </div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            推荐来源：
            <span className="ml-1">{section.recommendedSources.join("、")}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm bg-primary/8 px-3 py-2 rounded-xl">
          <label className="flex items-center gap-2">
            <span className="i-ph:clock-duotone" />
            <span>时长(分)</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={section.durationMinutes}
              onChange={e => onDurationChange(section.id, Number(e.target.value) || 0)}
              className="w-20 rounded-md border border-neutral-200 dark:border-neutral-700 bg-transparent px-2 py-1 focus:(outline-none border-primary)"
            />
          </label>
          <span className="text-neutral-500 flex items-center gap-1">
            <span>≈</span>
            <span>{targetWords}</span>
            <span>字</span>
          </span>
        </div>
      </header>

      <div className="grid gap-3">
        <label className="flex flex-col gap-2 text-sm">
          <span className="flex items-center gap-2 font-medium">
            <span className="i-ph:sparkle-duotone text-primary" />
            <span>提示词</span>
          </span>
          <textarea
            value={section.prompt}
            rows={3}
            onChange={e => onPromptChange(section.id, e.target.value)}
            className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-3 py-2 focus:(outline-none border-primary)"
            placeholder="为大模型定制指令"
          />
        </label>

        <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
          {section.searchQueries.map(query => (
            <span key={query.id} className="px-2 py-1 rounded-lg bg-primary/10 text-primary">
              {query.label}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 p-3 bg-neutral-50/50 dark:bg-neutral-900/40">
        <div className="flex items-center gap-2 text-sm font-medium mb-2">
          <span className="i-ph:scroll-duotone text-primary" />
          <span>生成结果</span>
          {loading && <span className="i-ph:spinner-gap-duotone animate-spin text-primary" />}
        </div>
        {result
          ? (
              <div className="flex flex-col gap-3">
                <article className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {result.content}
                </article>
                <div className="text-xs text-neutral-500 flex flex-col gap-1">
                  <div className="font-semibold text-neutral-600 dark:text-neutral-300">引用链接</div>
                  {result.references.length === 0 && <span>暂无引用</span>}
                  {result.references.map((ref, index) => {
                    const referenceKey = ref.url ?? `${ref.title}-${ref.snippet ?? index}`
                    return (
                      <a
                        key={referenceKey}
                        href={ref.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-dotted hover:color-primary truncate"
                        title={ref.url}
                      >
                        <span className="inline-flex gap-1">
                          <span>
                            [
                            {index + 1}
                            ]
                          </span>
                          <span>{ref.title}</span>
                        </span>
                      </a>
                    )
                  })}
                </div>
              </div>
            )
          : (
              <p className="text-sm text-neutral-500">等待生成或手动填写…</p>
            )}
      </div>
    </div>
  )
}
