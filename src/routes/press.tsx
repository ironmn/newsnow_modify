import { createFileRoute } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import type {
  PressGenerationRequest,
  PressGenerationResponse,
  PressSearchMode,
  PressSectionID,
  PressSectionResult,
} from "@shared/press"
import { defaultPressSections } from "@shared/press"
import { type EditableSection, PressSectionCard } from "~/components/press/section-card"
import { useToast } from "~/hooks/useToast"
import { myFetch } from "~/utils"

export const Route = createFileRoute("/press")({
  component: PressRoute,
})

type ResultMap = Partial<Record<PressSectionID, PressSectionResult>>

function PressRoute() {
  const toast = useToast()
  const [searchMode, setSearchMode] = useState<PressSearchMode>("web")
  const [sections, setSections] = useState<EditableSection[]>(() => defaultPressSections.map(section => ({
    ...section,
    durationMinutes: section.durationMinutes,
    prompt: section.defaultPrompt,
  })))
  const [results, setResults] = useState<ResultMap>({})

  const mutation = useMutation({
    mutationFn: async (payload: PressGenerationRequest) => {
      return myFetch<PressGenerationResponse>("/press/generate", {
        method: "POST",
        body: payload,
      })
    },
    onSuccess: (data) => {
      const next: ResultMap = {}
      data.sections?.forEach((item) => {
        next[item.id] = item
      })
      setResults(next)
      toast("生成完成", { type: "success" })
    },
    onError: (error: any) => {
      toast(error?.data?.message ?? error?.message ?? "生成失败", { type: "error" })
    },
  })

  const onPromptChange = (id: PressSectionID, prompt: string) => {
    setSections(prev => prev.map(section => section.id === id ? { ...section, prompt } : section))
  }

  const onDurationChange = (id: PressSectionID, duration: number) => {
    setSections(prev => prev.map(section => section.id === id ? { ...section, durationMinutes: Math.max(duration, 0.1) } : section))
  }

  const handleGenerate = () => {
    const payload: PressGenerationRequest = {
      searchMode,
      sections: sections.map(section => ({
        id: section.id,
        prompt: section.prompt,
        durationMinutes: section.durationMinutes,
      })),
    }
    mutation.mutate(payload)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-base p-4 shadow-sm flex flex-col gap-4">
        <div className="flex flex-wrap justify-between gap-3 items-center">
          <div className="flex flex-col gap-1">
            <div className="text-xl font-semibold flex items-center gap-2">
              <span className="i-ph:newspaper-clipping-duotone text-primary" />
              <span>新闻稿自动生成</span>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              LangChain 风格工具链：SerpAPI 检索 + 智谱 Reader 取文 + DeepSeek 生成，并支持自定义提示词。
            </p>
          </div>
          <button
            type="button"
            className="btn px-4 py-2 bg-primary text-white rounded-xl flex items-center gap-2"
            onClick={handleGenerate}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? <span className="i-ph:spinner-gap-duotone animate-spin" /> : <span className="i-ph:play-duotone" />}
            <span>一键生成全文</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2 text-sm items-center">
          <span className="text-neutral-500">检索模式</span>
          {([{ id: "web", label: "全网搜索" }, { id: "skip", label: "关闭检索" }] as const).map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSearchMode(option.id)}
              className={$(
                "px-3 py-1 rounded-full border",
                searchMode === option.id
                  ? "bg-primary text-white border-primary"
                  : "border-neutral-200 dark:border-neutral-800",
              )}
            >
              {option.label}
            </button>
          ))}
          <span className="text-xs text-neutral-500">全网搜索将调用 SerpAPI + Reader；关闭时仅用提示词直接生成。</span>
        </div>
      </div>

      <div className="grid gap-4">
        {sections.map(section => (
          <PressSectionCard
            key={section.id}
            section={section}
            result={results[section.id]}
            loading={mutation.isPending}
            onPromptChange={onPromptChange}
            onDurationChange={onDurationChange}
          />
        ))}
      </div>
    </div>
  )
}
