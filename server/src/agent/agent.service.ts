import { Injectable, OnModuleInit } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { DataService } from '../data/data.service';

const SYSTEM_PROMPT = `你是前端秋招面试复盘助手。用户是一位参加前端秋招的同学，以下是她的真实面试记录（录音转写后提炼的知识点和原文节选）。

回答要求：
1. 优先基于提供的资料回答；资料中没有的内容可结合你的知识补充，并注明"（资料外补充）"；
2. 如果被问到"我答得怎么样"，如实根据每条知识点的掌握情况（good/partial/poor）评价，并给出针对性补强建议；
3. 用中文回答，简洁分点，重点突出，不要客套。`;

const AgentState = Annotation.Root({
  question: Annotation<string>({ reducer: (_a, b) => b ?? _a, default: () => '' }),
  history: Annotation<any[]>({ reducer: (_a, b) => b ?? _a ?? [], default: () => [] }),
  context: Annotation<string>({ reducer: (_a, b) => b ?? _a ?? '', default: () => '' }),
  refs: Annotation<any[]>({ reducer: (_a, b) => b ?? _a ?? [], default: () => [] }),
  answer: Annotation<string>({ reducer: (_a, b) => b ?? _a ?? '', default: () => '' }),
});

@Injectable()
export class AgentService implements OnModuleInit {
  private llm: ChatOpenAI | null = null;
  private graph: any = null;

  constructor(private readonly data: DataService) {}

  onModuleInit() {
    if (process.env.DEEPSEEK_API_KEY) {
      this.llm = new ChatOpenAI({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        apiKey: process.env.DEEPSEEK_API_KEY,
        configuration: { baseURL: 'https://api.deepseek.com' },
        temperature: 0.3,
        maxTokens: 2048,
      });
    }

    this.graph = new StateGraph(AgentState)
      .addNode('retrieve', this.retrieveNode.bind(this))
      .addNode('generate', this.generateNode.bind(this))
      .addEdge(START, 'retrieve')
      .addEdge('retrieve', 'generate')
      .addEdge('generate', END)
      .compile();
  }

  /** 检索节点：BM25 风格打分，命中知识点 + 原文切片 */
  private retrieveNode(state: typeof AgentState.State) {
    const toks = this.tokenize(state.question);
    const items = this.score(toks, this.data.allItems, (it: any) =>
      it.question + ' ' + it.answer_points.join(' ') + ' ' + (it.note || ''), 3,
    ).slice(0, 8);
    const chunks = this.score(toks, this.data.allChunks, (c: any) => c.text, 1).slice(0, 5);

    const catMap = Object.fromEntries(this.data.categoryList.map((c: any) => [c.id, c.label]));
    const context = [
      '===== 结构化知识点 =====',
      ...items.map((it: any) =>
        `【${it.company}·${it.round}·${catMap[it.category] || it.category}·${it.quality}】\n问：${it.question}\n答要点：${it.answer_points.join('；')}${it.note ? `\n我的订正笔记：${it.note}` : ''}`),
      '',
      '===== 面试原文节选 =====',
      ...chunks.map((c: any) => `【${c.company}原文】${c.text}`),
    ].join('\n\n');

    return { context, refs: items };
  }

  /** 生成节点：DeepSeek 流式生成；未配置 key 时降级为本地检索结果 */
  private async generateNode(state: typeof AgentState.State) {
    if (!this.llm) {
      return { answer: this.localAnswer(state.refs) };
    }
    const messages = [
      new SystemMessage(SYSTEM_PROMPT + '\n\n' + (state.context || '（未检索到直接相关资料，凭你的理解回答）')),
      ...state.history.slice(-6),
      new HumanMessage(state.question),
    ];
    let answer = '';
    const stream = await this.llm.stream(messages);
    for await (const chunk of stream) {
      answer += typeof chunk.content === 'string' ? chunk.content : '';
    }
    return { answer };
  }

  private localAnswer(refs: any[]) {
    if (!refs?.length) {
      return '本地检索模式：没有找到相关知识点。请换个说法，或在 server/.env 中配置 DEEPSEEK_API_KEY 后直接向我提问。';
    }
    const lines = refs.map((it: any, i: number) =>
      `${i + 1}. [${it.company}·${it.quality}] ${it.question}\n   要点：${it.answer_points.join('；')}`,
    );
    return `本地检索模式（未配置 DEEPSEEK_API_KEY）：找到 ${refs.length} 条相关知识点\n\n` +
      lines.join('\n') + '\n\n配置 key 后可获得 AI 生成的针对性回答。';
  }

  /** 供 controller 获取 LangGraph 事件流 */
  streamEvents(input: { question: string; history: any[] }) {
    return this.graph.streamEvents(
      { question: input.question, history: input.history },
      { version: 'v2' },
    );
  }

  // ==================== 上传新面经：LLM 结构化抽取 ====================

  /** 长文按换行切成 ~6000 字的块，供逐块抽取 */
  private splitText(text: string, size = 6000): string[] {
    if (text.length <= size) return [text];
    const parts: string[] = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + size, text.length);
      if (end < text.length) {
        // 尽量在换行处断开（向后找最近的换行）
        const nl = text.lastIndexOf('\n', end);
        if (nl > start + size * 0.5) end = nl;
      }
      parts.push(text.slice(start, end).trim());
      start = end;
    }
    return parts.filter(Boolean);
  }

  private extractPrompt(company: string, round: string) {
    const catDesc = this.data.categoryList
      .map((c: any) => `   - ${c.id}：${c.label}（${c.desc || ''}）`)
      .join('\n');
    return `你是面经结构化抽取器。以下是一份面试录音转写实录的片段（公司：${company}，轮次：${round}，候选人：前端方向）。
请通读片段，抽取其中出现的每一道面试问题/知识点。

分类 category 只能取以下值之一：
${catDesc}

每条字段：
- "category"：如上分类
- "question"：精炼后的面试官问题（去掉口语废话）
- "answer_points"：候选人回答要点数组（每点一句话，提炼他实际说到的点）
- "quality"："good"（答得较完整）/"partial"（答出一部分或被引导）/"poor"（基本没答上）
- "quote"：原文中能定位该问题的一小段引文（20-40字）

注意：同一问题反复追问合并为一条，追问出的新知识点单独成条；项目深挖的每个子问题都算独立条目；片段中没有问题则输出 []。
只输出 JSON 数组本身，不要任何解释文字、不要 markdown 代码块围栏。`;
  }

  private parseJsonArray(raw: string): any[] {
    if (!raw) return [];
    let s = raw.trim();
    s = s.replace(/```(json)?/g, '').trim();
    const l = s.indexOf('[');
    const r = s.lastIndexOf(']');
    if (l !== -1 && r > l) s = s.slice(l, r + 1);
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  private async extractChunk(
    part: string, company: string, round: string, idx: number, total: number,
  ): Promise<any[]> {
    const res = await this.llm!.invoke([
      new SystemMessage(this.extractPrompt(company, round)),
      new HumanMessage(`（第 ${idx}/${total} 段）\n\n${part}`),
    ]);
    const raw = typeof res.content === 'string' ? res.content : '';
    return this.parseJsonArray(raw);
  }

  /** 导入新面经：分块抽取 → 规范化 → 写入 store（同步供问答检索） */
  async importInterview(input: { company: string; round?: string; date?: string; status?: string; text: string }) {
    if (!this.llm) {
      throw new Error('未配置 DEEPSEEK_API_KEY，无法智能分析。请在 server/.env 中配置后重启服务。');
    }
    const company = (input.company || '').trim();
    const date = (input.date || '').trim();
    let round = (input.round || '一面').trim() || '一面';
    if (date) round = `${date} ${round}`;
    const status = (input.status || '').trim() || undefined;
    const text = (input.text || '').trim();
    if (!company) throw new Error('请填写公司名称');
    if (text.length < 50) throw new Error('面经文本太短（至少 50 字）');

    const parts = this.splitText(text);
    const raw: any[] = [];
    for (let i = 0; i < parts.length; i++) {
      const batch = await this.extractChunk(parts[i], company, round, i + 1, parts.length);
      raw.push(...batch);
    }

    // 规范化：分类白名单校验 + 网络/OS 题迁移到 cs_fundamentals（与 build-data 规则一致）
    const validCats = new Set(this.data.categoryList.map((c: any) => c.id));
    const csKeywords = ['HTTPS', 'HTTP', 'URL', 'TLS', 'SSE', 'WebSocket', 'NFS', '网关', '证书', 'TCP', '网络', '操作系统'];
    const ts = Date.now();
    const items = raw
      .filter((it) => it && it.question && typeof it.question === 'string')
      .map((it, i) => {
        let category = String(it.category || '').trim();
        if (!validCats.has(category)) category = 'project_scenario';
        const q = String(it.question);
        if (category === 'backend' && csKeywords.some((k) => q.includes(k))) {
          category = 'cs_fundamentals';
        }
        return {
          id: `imp-${ts}-${i}`,
          company,
          round,
          category,
          question: q.trim(),
          answer_points: Array.isArray(it.answer_points)
            ? it.answer_points.map(String).filter(Boolean)
            : [String(it.answer_points || '')].filter(Boolean),
          quality: ['good', 'partial', 'poor'].includes(it.quality) ? it.quality : 'partial',
          quote: String(it.quote || '').trim(),
        };
      });
    const chunks = parts.map((t, i) => ({ id: `chunk-imp-${ts}-${i}`, company, text: t }));

    this.data.addInterview(items, chunks, status);
    return { added: items.length, parts: parts.length, stats: this.data.getStats() };
  }

  private tokenize(s: string): Set<string> {
    const clean = (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
    const set = new Set<string>();
    for (const p of clean.split(/\s+/).filter(Boolean)) {
      if (/^[a-z]+$/.test(p) && p.length > 1) set.add(p);
      else for (let i = 0; i < p.length - 1; i++) set.add(p.slice(i, i + 2));
    }
    return set;
  }

  private score(toks: Set<string>, arr: any[], getText: (x: any) => string, weight: number) {
    if (!toks.size) return [];
    return arr
      .map((x) => {
        const lower = getText(x).toLowerCase();
        let s = 0;
        for (const t of toks) {
          let idx = 0, c = 0;
          while ((idx = lower.indexOf(t, idx)) !== -1) { c++; idx += t.length; }
          s += c * (t.length > 2 ? 1.5 : 1) * weight;
        }
        return { x, s };
      })
      .filter((o) => o.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((o) => o.x);
  }
}

export { HumanMessage, AIMessage };
