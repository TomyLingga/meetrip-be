// ─── Routes: DP (Down Payment) ────────────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDpByBtoIdService, createOrUpdateDpService } from '../services/dp.service';
import { ok } from '../utils/response';
import { AppError } from '../utils/errorHandler';

const dpUpsertSchema = z.object({
  exchangeRateUsd: z.number().optional(),
  rincian: z.array(
    z.object({
      rincianId: z.string().uuid(),
      rincianLabel: z.string().optional(),
      jumlahHari: z.number().int().min(1),
      nilaiPerHari: z.number().min(0),
      nilaiTotal: z.number().min(0),
      useDollar: z.boolean(),
      nilaiUsd: z.number().optional(),
      paguSaatInput: z.number().optional(),
      isUnlimited: z.boolean().optional(),
      catatan: z.string().optional(),
    })
  ),
});

export default async function dpRoutes(fastify: FastifyInstance) {
  
  /** GET /api/dp/bto/:btoId — Dapatkan data DP untuk BTO */
  fastify.get('/bto/:btoId', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = req.params as { btoId: string };
    const result = await getDpByBtoIdService(btoId);
    return reply.send(ok(result));
  });

  /** POST /api/dp/bto/:btoId — Create/Update DP */
  fastify.post('/bto/:btoId', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = req.params as { btoId: string };
    const data = dpUpsertSchema.parse(req.body);
    const actor = { id: req.user.sub, nama: req.user.nama || '' };
    const result = await createOrUpdateDpService(btoId, actor, data);
    return reply.send(ok(result));
  });

  /** POST /api/dp/bto/:btoId/preview — Preview DP calculation */
  fastify.post('/bto/:btoId/preview', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const data = dpUpsertSchema.parse(req.body);
    const exchangeRate = data.exchangeRateUsd || 1;
    let totalIdr = 0;
    let totalUsd = 0;

    data.rincian.forEach((r) => {
      if (r.useDollar) {
        const valUsd = Number(r.nilaiUsd || r.nilaiTotal);
        totalUsd += valUsd;
        totalIdr += valUsd * exchangeRate;
      } else {
        totalIdr += Number(r.nilaiTotal);
      }
    });

    return reply.send(ok({ totalIdr, totalUsd, exchangeRate }));
  });
}
