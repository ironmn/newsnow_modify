export const PRESS_WORDS_PER_MINUTE = 260

export type PressSectionID = "major-news" | "power-zhejiang-qiantang" | "party-discipline"

export type PressSearchMode = "web" | "skip"

export interface PressSearchQuery {
  id: string
  label: string
  query: string
}

export interface PressSectionConfig {
  id: PressSectionID
  title: string
  durationMinutes: number
  defaultPrompt: string
  recommendedSources: string[]
  searchQueries: PressSearchQuery[]
  targetWords?: number
}

export interface PressSectionInput {
  id: PressSectionID
  prompt?: string
  durationMinutes?: number
}

export interface PressReference {
  title: string
  url: string
  snippet?: string
}

export interface PressSectionResult {
  id: PressSectionID
  title: string
  durationMinutes: number
  targetWords: number
  content: string
  references: PressReference[]
  usedQueries: string[]
}

export interface PressGenerationRequest {
  sections?: PressSectionInput[]
  searchMode?: PressSearchMode
}

export interface PressGenerationResponse {
  sections: PressSectionResult[]
  searchMode: PressSearchMode
}

export const defaultPressSections: PressSectionConfig[] = [
  {
    id: "major-news",
    title: "国际国内重大新闻",
    durationMinutes: 0.5,
    targetWords: 130,
    recommendedSources: ["央视新闻联播", "新华网", "人民网"],
    defaultPrompt: "结合国家能源战略、科技民生、宏观政策等角度，用简洁串联句概括重点，突出对公司战略部署的启示。",
    searchQueries: [
      {
        id: "national-international",
        label: "央媒/权威渠道日更",
        query: "(site:news.cctv.com OR site:xinhuanet.com OR site:people.com.cn) (intitle:\"能源\" OR intitle:\"电力\" OR intitle:\"科技\" OR intitle:\"战略\" OR \"习近平\" OR \"国务院\") -intitle:\"直播\" -intitle:\"回放\"",
      },
    ],
  },
  {
    id: "power-zhejiang-qiantang",
    title: "电力行业 / 浙江电力 / 钱塘区政府新闻",
    durationMinutes: 1,
    targetWords: 260,
    recommendedSources: ["浙江电力报", "国家电网、省市公司", "钱塘区政府要闻"],
    defaultPrompt: "聚焦行业政策、保供运行、数字化转型和属地重大项目，输出一段面向公司内部的播报，便于员工理解行业趋势与属地动态。",
    searchQueries: [
      {
        id: "power-industry",
        label: "国家电网/能源局",
        query: "(site:cpnn.com.cn OR site:nea.gov.cn) (国家电网 OR 浙江电力 OR 迎峰度夏 OR 迎峰度冬 OR 保供 OR 数字化转型 OR 新型电力系统)",
      },
      {
        id: "qiantang",
        label: "钱塘区政府",
        query: "(intitle:钱塘 OR intitle:钱塘区 OR intitle:钱塘新区 OR intitle:杭州钱塘) (政府 OR 供电 OR 电网 OR 重大项目 OR 科技) -site:qiantang.gov.cn -site:zj.gov.cn",
      },
    ],
  },
  {
    id: "party-discipline",
    title: "党务与廉政学习",
    durationMinutes: 0.5,
    targetWords: 130,
    recommendedSources: ["党章党规", "最新理论成果", "廉政警示案例"],
    defaultPrompt: "从党务要点、廉政警示、关键名词解释三个角度浓缩一则学习提示，方便班前/例会上快速宣讲。",
    searchQueries: [
      {
        id: "discipline",
        label: "权威党务/纪检",
        query: "(site:cpc.people.com.cn OR site:ccdi.gov.cn OR site:people.com.cn) (廉政 OR 党纪 OR 党章 OR 八项规定 OR 警示教育 OR \"第一种形态\" OR \"双化双强\")",
      },
    ],
  },
]

export const pressSectionMap = defaultPressSections.reduce((acc, section) => {
  acc[section.id] = section
  return acc
}, {} as Record<PressSectionID, PressSectionConfig>)
