import { useCallback, useEffect, useMemo, useState } from "react"
import type {
  PressApiConfig,
  PressConfigSaveResponse,
  PressConfigSnapshot,
  PressConfigSource,
  PressConfigStatus,
  PressConfigStatusResponse,
} from "@shared/press"
import { useToast } from "~/hooks/useToast"
import { myFetch } from "~/utils"

interface Props {
  open: boolean
  onClose: () => void
}

const SOURCE_LABELS: Record<PressConfigSource, string> = {
  db: "本地数据库",
  env: "环境变量",
  none: "未配置",
}

export function PressConfigModal({ open, onClose }: Props) {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [snapshot, setSnapshot] = useState<PressConfigSnapshot>({
    source: "none",
    dbExists: false,
  })
  const [form, setForm] = useState<PressApiConfig>({
    deepseekApiBase: "https://api.deepseek.com",
    deepseekModel: "deepseek-chat",
  })
  const [statuses, setStatuses] = useState<PressConfigStatus[]>([])

  const sourceLabel = useMemo(() => SOURCE_LABELS[snapshot.source], [snapshot.source])

  const fetchSnapshot = useCallback(async () => {
    try {
      setLoading(true)
      const data = await myFetch<PressConfigSnapshot>("/press/config")
      setSnapshot(data)
      if (data.config) {
        setForm(prev => ({
          ...prev,
          ...data.config,
          deepseekApiBase: data.config.deepseekApiBase ?? prev.deepseekApiBase,
          deepseekModel: data.config.deepseekModel ?? prev.deepseekModel,
        }))
      }
    } catch (error: any) {
      toast(error?.data?.message ?? error?.message ?? "读取配置失败", { type: "error" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (open) void fetchSnapshot()
  }, [fetchSnapshot, open])

  const handleSave = async () => {
    try {
      setSaving(true)
      const data = await myFetch<PressConfigSaveResponse>("/press/config", {
        method: "POST",
        body: form,
      })
      setSnapshot(data)
      toast("配置已保存到本地 SQLite", { type: "success" })
    } catch (error: any) {
      toast(error?.data?.message ?? error?.message ?? "保存失败", { type: "error" })
    } finally {
      setSaving(false)
    }
  }

  const handleCheck = async () => {
    try {
      setChecking(true)
      const res = await myFetch<PressConfigStatusResponse>("/press/status")
      setStatuses(res.statuses)
      setSnapshot(prev => ({ ...prev, source: res.source }))
      toast("已完成连通性检查", { type: "success" })
    } catch (error: any) {
      toast(error?.data?.message ?? error?.message ?? "检查失败", { type: "error" })
    } finally {
      setChecking(false)
    }
  }

  const handleChange = (key: keyof PressApiConfig, value: string) => {
    setForm(prev => ({
      ...prev,
      [key]: value,
    }))
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-3xl rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-base shadow-2xl">
        <header className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 px-5 py-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <span className="i-ph:gear-six-duotone text-primary" />
              <span>配置与连通性测试</span>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              设置 SerpAPI、Reader 与 DeepSeek 的密钥，保存到本地 SQLite（press-config.db），并可一键检测可用性。
            </p>
            <div className="text-xs text-neutral-500 flex items-center gap-2">
              <span className="i-ph:database-duotone" />
              <span>{snapshot.dbExists ? "已检测到本地 .db 文件" : "尚未创建 .db，保存后自动生成"}</span>
              <span className="i-ph:info-duotone" />
              <span className="flex items-center gap-1">
                <span>当前生效：</span>
                <span>{sourceLabel}</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            className="rounded-full p-2 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            onClick={onClose}
          >
            <span className="i-ph:x-circle-duotone text-xl" />
          </button>
        </header>

        <div className="grid gap-4 px-5 py-4">
          <div className="grid gap-4 md:grid-cols-2">
            <InputField
              label="SerpAPI Key"
              placeholder="serp_api_key"
              value={form.serpApiKey ?? ""}
              onChange={value => handleChange("serpApiKey", value)}
              loading={loading}
            />
            <InputField
              label="Reader API Key"
              placeholder="reader_api_key"
              value={form.readerApiKey ?? ""}
              onChange={value => handleChange("readerApiKey", value)}
              loading={loading}
            />
            <InputField
              label="DeepSeek API Key"
              placeholder="deepseek api key"
              value={form.deepseekApiKey ?? ""}
              onChange={value => handleChange("deepseekApiKey", value)}
              loading={loading}
            />
            <InputField
              label="DeepSeek API Base"
              placeholder="https://api.deepseek.com"
              value={form.deepseekApiBase ?? ""}
              onChange={value => handleChange("deepseekApiBase", value)}
              loading={loading}
            />
            <InputField
              label="DeepSeek Model"
              placeholder="deepseek-chat"
              value={form.deepseekModel ?? ""}
              onChange={value => handleChange("deepseekModel", value)}
              loading={loading}
            />
          </div>

          <div className="flex flex-wrap gap-3 justify-between items-center">
            <div className="text-xs text-neutral-500">
              {snapshot.config?.updatedAt ? `最近保存：${new Date(snapshot.config.updatedAt).toLocaleString()}` : "尚未保存"}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCheck}
                className="btn px-4 py-2 rounded-xl border border-primary text-primary flex items-center gap-2"
                disabled={checking}
              >
                {checking ? <span className="i-ph:spinner-gap-duotone animate-spin" /> : <span className="i-ph:stethoscope-duotone" />}
                <span>连通性检测</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="btn px-4 py-2 rounded-xl bg-primary text-white flex items-center gap-2"
                disabled={saving}
              >
                {saving ? <span className="i-ph:spinner-gap-duotone animate-spin" /> : <span className="i-ph:floppy-disk-duotone" />}
                <span>保存配置</span>
              </button>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="i-ph:pulse-duotone text-primary" />
              <span>API 状态</span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {statuses.length === 0 && (
                <p className="text-sm text-neutral-500 md:col-span-3">点击“连通性检测”查看状态。</p>
              )}
              {statuses.map(status => (
                <StatusCard key={status.id} status={status} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InputField({ label, placeholder, value, onChange, loading }: {
  label: string
  placeholder?: string
  value: string
  loading?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="text-neutral-600 dark:text-neutral-200 flex items-center gap-2">
        <span className="i-ph:key-duotone text-primary" />
        <span>{label}</span>
      </span>
      <input
        className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-3 py-2 focus:(outline-none border-primary)"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={loading}
      />
    </label>
  )
}

function StatusCard({ status }: { status: PressConfigStatus }) {
  const color = status.ok ? "text-green-600 bg-green-50 dark:text-green-200 dark:bg-green-900/40" : "text-red-600 bg-red-50 dark:text-red-200 dark:bg-red-900/40"
  return (
    <div className={`rounded-xl border px-3 py-3 flex flex-col gap-1 ${color} border-transparent`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className={status.ok ? "i-ph:check-circle-duotone" : "i-ph:warning-octagon-duotone"} />
        <span>{status.label}</span>
      </div>
      <div className="text-xs opacity-80">
        <div>{status.message ?? (status.ok ? "正常" : "未配置")}</div>
        {status.latencyMs != null && (
          <div className="flex items-center gap-1">
            <span>耗时：</span>
            <span>{status.latencyMs}</span>
            <span>ms</span>
          </div>
        )}
        {status.checkedAt && (
          <div className="flex items-center gap-1">
            <span>时间：</span>
            <span>{new Date(status.checkedAt).toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  )
}
