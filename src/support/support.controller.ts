import { Body, Controller, Get, Param, Post, Req, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { BetterAuthJwtGuard } from '../auth-integration/better-auth-jwt.guard';
import { AuthenticatedUser } from '../auth-integration/auth-integration.service';
import { SupportService } from './support.service';
import { AddSupportMessageInput, CreateAiChatMessageInput, CreateSupportTicketInput, EscalateAiChatInput } from './support.types';
import type { AiChatSessionView, SupportMessageView, SupportTicketView } from './support.types';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

@Controller({ path: 'support', version: ['1', VERSION_NEUTRAL] })
@UseGuards(BetterAuthJwtGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('tickets')
  async createTicket(
    @Req() req: RequestWithUser,
    @Body() input: CreateSupportTicketInput,
  ): Promise<{ ticket: SupportTicketView; message?: SupportMessageView | null } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.support.createTicket(user.id, input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to create ticket' };
    }
  }

  @Get('tickets/mine')
  async listMine(@Req() req: RequestWithUser): Promise<SupportTicketView[]> {
    const user = req.user;
    if (!user) return [];
    return this.support.listMyTickets(user.id);
  }

  @Get('tickets/:ticketId/messages')
  async listMessages(@Req() req: RequestWithUser, @Param('ticketId') ticketId: string): Promise<SupportMessageView[]> {
    const user = req.user;
    if (!user) return [];
    return this.support.listTicketMessages(user.id, ticketId);
  }

  @Post('tickets/:ticketId/messages')
  async addMessage(
    @Req() req: RequestWithUser,
    @Param('ticketId') ticketId: string,
    @Body() input: AddSupportMessageInput,
  ): Promise<SupportMessageView | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.support.addTicketMessage(user.id, ticketId, input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to add message' };
    }
  }

  // Help bot (demo mode)
  @Post('help-bot/message')
  async helpBot(
    @Req() req: RequestWithUser,
    @Body() input: CreateAiChatMessageInput,
  ): Promise<{ session: AiChatSessionView; reply: string } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.support.sendHelpBotMessage(user.id, input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to send message' };
    }
  }

  @Post('help-bot/escalate')
  async escalate(
    @Req() req: RequestWithUser,
    @Body() input: EscalateAiChatInput,
  ): Promise<{ success: boolean; ticketId: string | null } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.support.escalateChatToTicket(user.id, input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to escalate' };
    }
  }
}

