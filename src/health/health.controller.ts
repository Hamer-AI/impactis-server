import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';

@Controller({ path: 'health', version: ['1', VERSION_NEUTRAL] })
export class HealthController {
  @Get()
  getHealth() {
    return { status: 'ok' };
  }
}
