import fs from 'fs';
import path from 'path';
import { Injectable, OnModuleInit } from '@nestjs/common';

export interface Item {
  id: string;
  company: string;
  round: string;
  category: string;
  question: string;
  answer_points: string[];
  quality: 'good' | 'partial' | 'poor';
  quote: string;
  flagged?: boolean;
  resolved?: boolean;
  /** 标记已解决的时间戳（ms），取消时清除 */
  resolvedAt?: number;
  /** 我的订正笔记 */
  note?: string;
}

/** 面试结果状态（按公司维度） */
export type InterviewStatus = 'pass' | 'pool' | 'fail';
export const INTERVIEW_STATUSES: InterviewStatus[] = ['pass', 'pool', 'fail'];

@Injectable()
export class DataService implements OnModuleInit {
  private items: Item[] = [];
  private chunks: { id: string; company: string; text: string }[] = [];
  private meta: any = {};
  private categories: any[] = [];
  private interviews: Record<string, InterviewStatus> = {};
  // 编译后 __dirname = server/dist/data；数据位于 app/data/store.json
  private storePath = path.resolve(__dirname, '..', '..', '..', 'data', 'store.json');

  onModuleInit() {
    this.reload();
  }

  reload() {
    if (!fs.existsSync(this.storePath)) {
      throw new Error(`数据文件不存在: ${this.storePath}，请先运行 npm run build:data`);
    }
    const store = JSON.parse(fs.readFileSync(this.storePath, 'utf-8'));
    this.items = store.items;
    this.chunks = store.chunks;
    this.meta = store.meta;
    this.categories = store.categories;
    this.interviews = store.interviews || {};
  }

  getStats() {
    return { ...this.meta, categories: this.categories, interviews: this.interviews };
  }

  listItems(filter: {
    category?: string;
    company?: string;
    quality?: string;
    search?: string;
  } = {}): Item[] {
    let items = this.items;
    if (filter.category && filter.category !== 'all') {
      items = items.filter((i) => i.category === filter.category);
    }
    if (filter.company) items = items.filter((i) => i.company === filter.company);
    if (filter.quality) items = items.filter((i) => i.quality === filter.quality);
    if (filter.search && filter.search.trim()) {
      const kw = filter.search.trim().toLowerCase();
      items = items.filter(
        (i) =>
          i.question.toLowerCase().includes(kw) ||
          i.quote.toLowerCase().includes(kw) ||
          i.answer_points.join(' ').toLowerCase().includes(kw) ||
          (i.note || '').toLowerCase().includes(kw),
      );
    }
    return items;
  }

  /** 单场面试视图：题目 + 按分类/掌握度的统计 */
  getItem(id: string): Item | undefined {
    return this.items.find((i) => i.id === id);
  }

  getInterview(company: string) {
    const items = this.items.filter((i) => i.company === company);
    if (!items.length) return null;
    const byCategory: Record<string, number> = {};
    const byQuality: Record<string, number> = {};
    for (const it of items) {
      byCategory[it.category] = (byCategory[it.category] || 0) + 1;
      byQuality[it.quality] = (byQuality[it.quality] || 0) + 1;
    }
    return { company, total: items.length, byCategory, byQuality, items };
  }

  /** 删除整场面试：移除该公司所有知识点与原文切片，返回删除的题数 */
  deleteInterview(company: string): number {
    const before = this.items.length;
    this.items = this.items.filter((i) => i.company !== company);
    this.chunks = this.chunks.filter((c) => c.company !== company);
    delete this.interviews[company];
    this.recomputeMeta();
    this.persist();
    return before - this.items.length;
  }

  /** 设置面试结果状态（status 为空表示清除标记），返回新状态 */
  setInterviewStatus(company: string, status: string): string | null {
    if (!company || !this.items.some((i) => i.company === company)) return null;
    if (!status) {
      delete this.interviews[company];
    } else {
      if (!INTERVIEW_STATUSES.includes(status as InterviewStatus)) return null;
      this.interviews[company] = status as InterviewStatus;
    }
    this.persist();
    return status || null;
  }

  /** 红旗标记切换：返回新的标记状态（未找到返回 null） */
  toggleFlag(id: string): boolean | null {
    const it = this.items.find((i) => i.id === id);
    if (!it) return null;
    it.flagged = !it.flagged;
    this.persist();
    return it.flagged;
  }

  /** 已解决标记切换：返回新的标记状态（未找到返回 null） */
  toggleResolve(id: string): boolean | null {
    const it = this.items.find((i) => i.id === id);
    if (!it) return null;
    it.resolved = !it.resolved;
    if (it.resolved) it.resolvedAt = Date.now();
    else delete it.resolvedAt;
    this.persist();
    return it.resolved;
  }

  /** 保存订正笔记，空字符串表示清除；返回保存后的笔记，题目不存在返回 null */
  setNote(id: string, note: string): string | null {
    const it = this.items.find((i) => i.id === id);
    if (!it) return null;
    const v = String(note ?? '').slice(0, 5000).trim();
    if (v) it.note = v;
    else delete it.note;
    this.persist();
    return v;
  }

  /** 导入新面经：追加知识点与原文切片，重算统计并落盘；status 顺带写入面试状态 */
  addInterview(
    items: Item[],
    chunks: { id: string; company: string; text: string }[],
    status?: string,
  ) {
    this.items = this.items.concat(items);
    this.chunks = this.chunks.concat(chunks);
    if (status && INTERVIEW_STATUSES.includes(status as InterviewStatus) && items.length) {
      this.interviews[items[0].company] = status as InterviewStatus;
    }
    this.recomputeMeta();
    this.persist();
  }

  /** 批量删除，返回剩余数量 */
  deleteItems(ids: string[]): number {
    const idSet = new Set(ids);
    this.items = this.items.filter((i) => !idSet.has(i.id));
    this.chunks = this.chunks; // 原文切片保留（它是面试录音原文，不随题目删除）
    this.recomputeMeta();
    this.persist();
    return idSet.size;
  }

  private recomputeMeta() {
    const byCategory: Record<string, number> = {};
    const byQuality: Record<string, number> = {};
    const byCompany: Record<string, number> = {};
    for (const it of this.items) {
      byCategory[it.category] = (byCategory[it.category] || 0) + 1;
      byQuality[it.quality] = (byQuality[it.quality] || 0) + 1;
      byCompany[it.company] = (byCompany[it.company] || 0) + 1;
    }
    this.meta = {
      ...this.meta,
      total: this.items.length,
      companies: Object.keys(byCompany),
      byCategory, byQuality, byCompany,
    };
  }

  private persist() {
    fs.writeFileSync(
      this.storePath,
      JSON.stringify(
        { meta: this.meta, categories: this.categories, items: this.items, chunks: this.chunks, interviews: this.interviews },
        null, 1,
      ),
      'utf-8',
    );
  }

  get allItems() { return this.items; }
  get allChunks() { return this.chunks; }
  get categoryList() { return this.categories; }
}
