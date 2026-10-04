import { Controller, Get, Query } from '@nestjs/common';
import { Permission } from '../access/permissions';
import { RequirePermissions } from '../common/decorators/access.decorators';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(Permission.AUDIT_VIEW)
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
  ) {
    return this.audit.list({
      page: page ? Number(page) || 1 : undefined,
      pageSize: pageSize ? Number(pageSize) || undefined : undefined,
      action: action?.trim() || undefined,
      actorId: actorId?.trim() || undefined,
    });
  }
}
