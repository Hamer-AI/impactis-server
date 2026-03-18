import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type OrgType = 'startup' | 'investor' | 'advisor';

@Injectable()
export class AiMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  private norm(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const t = value.trim();
    return t.length ? t : null;
  }

  async enqueueOrg(orgId: string): Promise<void> {
    const id = this.norm(orgId);
    if (!id) return;
    await this.prisma.$queryRaw`
      insert into public.ai_embedding_jobs (org_id, status, attempts, run_after)
      values (${id}::uuid, 'pending', 0, timezone('utc', now()))
      on conflict do nothing
    `;
  }

  async processNextJob(limit = 1): Promise<{ processed: number }> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.trunc(limit))) : 1;
    let processed = 0;

    for (let i = 0; i < safeLimit; i++) {
      const jobs = await this.prisma.$queryRaw<Array<{ id: string; org_id: string }>>`
        select id::text as id, org_id::text as org_id
        from public.ai_embedding_jobs
        where status = 'pending'
          and (run_after is null or run_after <= timezone('utc', now()))
        order by created_at asc
        limit 1
        for update skip locked
      `;
      const job = jobs[0];
      if (!job?.id || !job.org_id) break;

      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          update public.ai_embedding_jobs
          set status = 'running', started_at = timezone('utc', now()), updated_at = timezone('utc', now())
          where id = ${job.id}::uuid
        `;

        const orgRows = await tx.$queryRaw<Array<{ type: string; name: string; country: string | null; tags: string[] }>>`
          select o.type::text as type, o.name, o.country, o.industry_tags as tags
          from public.organizations o
          where o.id = ${job.org_id}::uuid
          limit 1
        `;
        const org = orgRows[0];
        const orgType = this.norm(org?.type)?.toLowerCase() as OrgType | null;
        if (!orgType) throw new Error('Org not found');

        const answersRows = await tx.$queryRaw<Array<{ payload: any }>>`
          select case
            when ${orgType} = 'startup' then to_jsonb(sa)
            when ${orgType} = 'investor' then to_jsonb(ia)
            else to_jsonb(aa)
          end as payload
          from public.organizations o
          left join public.startup_onboarding_answers sa on sa.org_id = o.id
          left join public.investor_onboarding_answers ia on ia.org_id = o.id
          left join public.advisor_onboarding_answers aa on aa.org_id = o.id
          where o.id = ${job.org_id}::uuid
          limit 1
        `;
        const answers = answersRows[0]?.payload ?? {};

        const parts: string[] = [];
        parts.push(`org_type:${orgType}`);
        parts.push(`name:${org.name}`);
        if (org.country) parts.push(`country:${org.country}`);
        for (const t of (org.tags ?? [])) parts.push(`tag:${t}`);
        if (answers && typeof answers === 'object') {
          for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
            if (typeof v === 'string') {
              const vv = this.norm(v);
              if (vv) parts.push(`${k}:${vv}`);
            } else if (Array.isArray(v)) {
              for (const item of v) {
                if (typeof item === 'string') {
                  const ii = this.norm(item);
                  if (ii) parts.push(`${k}:${ii}`);
                }
              }
            }
          }
        }
        const embeddingText = parts.join('\n').slice(0, 20_000);

        await tx.$queryRaw`
          insert into public.org_ai_embeddings (org_id, embedding_text, embedding_vector, embedding_model)
          values (${job.org_id}::uuid, ${embeddingText}, '[]'::jsonb, 'heuristic-v3')
          on conflict (org_id) do update
          set embedding_text = excluded.embedding_text, updated_at = timezone('utc', now())
        `;

        // Compute heuristic matches: opposite-type orgs only.
        const oppositeTypes: OrgType[] =
          orgType === 'startup' ? ['investor', 'advisor'] : orgType === 'investor' ? ['startup'] : ['startup', 'investor'];

        const candidates = await tx.$queryRaw<Array<{ id: string; type: string; country: string | null; tags: string[] }>>`
          select o.id::text as id, o.type::text as type, o.country, o.industry_tags as tags
          from public.organizations o
          left join public.org_status s on s.org_id = o.id
          where o.id <> ${job.org_id}::uuid
            and o.type::text = any(${oppositeTypes}::text[])
            and coalesce(s.status::text, 'active') = 'active'
          limit 500
        `;

        const myTags = new Set((org.tags ?? []).map((t) => t.toLowerCase()));
        for (const c of candidates) {
          const theirTags = (c.tags ?? []).map((t) => t.toLowerCase());
          let overlap = 0;
          for (const t of theirTags) if (myTags.has(t)) overlap++;
          const geo = org.country && c.country && org.country.toLowerCase() === c.country.toLowerCase() ? 1 : 0;
          const score = Math.max(0, Math.min(100, overlap * 15 + geo * 10));
          const reasons: string[] = [];
          if (overlap > 0) reasons.push('Shared industry interests');
          if (geo) reasons.push('Same country');

          await tx.$queryRaw`
            insert into public.ai_match_scores (from_org_id, to_org_id, overall_score, score_breakdown, match_reasons, disqualified)
            values (
              ${job.org_id}::uuid,
              ${c.id}::uuid,
              ${score}::int,
              jsonb_build_object('tag_overlap', ${overlap}, 'geo', ${geo}),
              ${reasons}::text[],
              false
            )
            on conflict (from_org_id, to_org_id) do update
            set overall_score = excluded.overall_score,
                score_breakdown = excluded.score_breakdown,
                match_reasons = excluded.match_reasons,
                calculated_at = timezone('utc', now())
          `;
        }

        await tx.$queryRaw`
          update public.ai_embedding_jobs
          set status = 'succeeded', finished_at = timezone('utc', now()), updated_at = timezone('utc', now())
          where id = ${job.id}::uuid
        `;
      });

      processed++;
    }

    return { processed };
  }
}

