import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { DataService } from './data.service';

@Controller('api')
export class DataController {
  constructor(private readonly data: DataService) {}

  @Get('stats')
  stats() {
    return this.data.getStats();
  }

  @Get('items')
  items(
    @Query('category') category?: string,
    @Query('company') company?: string,
    @Query('quality') quality?: string,
    @Query('search') search?: string,
  ) {
    return {
      items: this.data.listItems({ category, company, quality, search }),
    };
  }

  @Get('interviews/:company')
  interview(@Param('company') company: string) {
    return this.data.getInterview(company);
  }

  @Post('items/:id/flag')
  toggleFlag(@Param('id') id: string) {
    const flagged = this.data.toggleFlag(id);
    if (flagged === null) return { ok: false, message: '题目不存在' };
    return { ok: true, flagged };
  }

  /** 已解决标记切换 */
  @Post('items/:id/resolve')
  toggleResolve(@Param('id') id: string) {
    const resolved = this.data.toggleResolve(id);
    if (resolved === null) return { ok: false, message: '题目不存在' };
    return { ok: true, resolved, resolvedAt: this.data.getItem(id)?.resolvedAt };
  }

  /** 保存订正笔记 */
  @Post('items/:id/note')
  setNote(@Param('id') id: string, @Body() body: { note?: string }) {
    const note = this.data.setNote(id, body?.note || '');
    if (note === null) return { ok: false, message: '题目不存在' };
    return { ok: true, note };
  }

  /** 设置单场面试的结果状态（通过/泡池子/挂），空 status 表示清除 */
  @Post('interviews/:company/status')
  setInterviewStatus(
    @Param('company') company: string,
    @Body() body: { status?: string },
  ) {
    const status = this.data.setInterviewStatus(company, body?.status || '');
    if (status === null) return { ok: false, message: '面试不存在或状态非法' };
    return { ok: true, status, stats: this.data.getStats() };
  }

  @Delete('interviews/:company')
  deleteInterview(@Param('company') company: string) {
    const removed = this.data.deleteInterview(company);
    return { removed, stats: this.data.getStats() };
  }

  @Delete('items')
  deleteItems(@Body() body: { ids: string[] }) {
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    const removed = this.data.deleteItems(ids);
    return { removed, stats: this.data.getStats() };
  }
}
