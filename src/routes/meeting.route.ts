import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  cancelMeetingService,
  checkRuangConflict,
  createMeetingService,
  listMeetingService,
  updateMeetingService,
} from '../services/meeting.service';
import { db } from '../db/connection';
import { meeting } from '../db/schema';
import { eq } from 'drizzle-orm';
import { ok } from '../utils/response';
import { AppError } from '../utils/errorHandler';
import { config } from '../config/env';

const meetingCreateSchema = z.object({
  topik: z.string().min(1).max(500),
  mulai: z.string().datetime(),
  selesai: z.string().datetime(),
  ruangId: z.preprocess((value) => value === '' ? undefined : value, z.string().uuid().optional()),
  ruangNama: z.preprocess((value) => value === '' ? undefined : value, z.string().max(100).optional()),
  needSoundSystem: z.boolean().default(false),
  needZoom: z.boolean().default(false),
  zoomLink: z.preprocess((value) => value === '' ? undefined : value, z.string().max(500).optional()),
  catatan: z.string().max(2000).optional(),
  partisipan: z.array(
    z.object({
      nama: z.string().min(1).max(200),
      email: z.preprocess((value) => value === '' ? undefined : value, z.string().email().max(200).optional()),
      jabatan: z.string().max(200).optional(),
      isExternal: z.boolean().default(false),
    })
  ).max(100),
});

const meetingListQuerySchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  ruangId: z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional()),
});

export default async function meetingRoutes(fastify: FastifyInstance) {
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const data = meetingCreateSchema.parse(req.body);
    const actor = req.user;
    const mt = await createMeetingService(actor.sub, actor.nama || '', {
      ...data,
      mulai: new Date(data.mulai),
      selesai: new Date(data.selesai),
    });
    return reply.status(201).send(ok(mt));
  });

  fastify.get('/', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const q = meetingListQuerySchema.parse(req.query);
    const result = await listMeetingService({
      dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
      ruangId: q.ruangId,
    });

    const portalUrl = `${config.portal.apiUrl}/api/sso/employees?limit=500`;
    let employees: any[] = [];
    try {
      const res = await fetch(portalUrl, {
        headers: { 'x-internal': config.portal.internalToken },
      });
      if (res.ok) {
        const body = await res.json() as { data: any[] };
        employees = body.data ?? [];
      }
    } catch (err) {
      fastify.log.warn({ err }, 'Gagal mengambil data employee dari portal untuk list meeting');
    }

    const employeeMap = new Map(employees.map(e => [e.id, e]));
    const mapped = result.map((m: any) => {
      const emp = employeeMap.get(m.createdBy);
      return {
        ...m,
        createdByNama: emp?.namaLengkap ?? m.createdByNama,
        createdByJabatan: emp?.jabatan ?? null,
      };
    });

    return reply.send(ok(mapped));
  });

  fastify.get('/public', async (req, reply) => {
    const q = meetingListQuerySchema.parse(req.query);
    const result = await listMeetingService({
      dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
      ruangId: q.ruangId,
    });

    const portalUrl = `${config.portal.apiUrl}/api/sso/employees?limit=500`;
    let employees: any[] = [];
    try {
      const res = await fetch(portalUrl, {
        headers: { 'x-internal': config.portal.internalToken },
      });
      if (res.ok) {
        const body = await res.json() as { data: any[] };
        employees = body.data ?? [];
      }
    } catch (err) {
      fastify.log.warn({ err }, 'Gagal mengambil data employee dari portal untuk list meeting public');
    }

    const employeeMap = new Map(employees.map(e => [e.id, e]));
    const mapped = result.map((m: any) => {
      const emp = employeeMap.get(m.createdBy);
      return {
        ...m,
        createdByNama: emp?.namaLengkap ?? m.createdByNama,
        createdByJabatan: emp?.jabatan ?? null,
      };
    });

    return reply.send(ok(mapped));
  });

  fastify.get('/check-ruang', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const q = z.object({
      ruangId: z.string().uuid(),
      mulai: z.string().datetime(),
      selesai: z.string().datetime(),
      excludeMeetingId: z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional()),
    }).parse(req.query);
    const conflict = await checkRuangConflict(
      q.ruangId,
      new Date(q.mulai),
      new Date(q.selesai),
      q.excludeMeetingId
    );
    return reply.send(ok({ conflict }));
  });

  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const mt = await db.query.meeting.findFirst({
      where: eq(meeting.id, id),
      with: {
        meetingPartisipan: true,
      },
    });
    if (!mt) throw new AppError('Meeting tidak ditemukan', 404);
    return reply.send(ok(mt));
  });

  fastify.put('/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = meetingCreateSchema.partial().parse(req.body);
    const isAdmin = (req.user.role || '').split(',').some(r => ['super_admin', 'admin'].includes(r));
    const result = await updateMeetingService(
      id,
      req.user.sub,
      {
        ...data,
        mulai: data.mulai ? new Date(data.mulai) : undefined,
        selesai: data.selesai ? new Date(data.selesai) : undefined,
      },
      isAdmin
    );
    return reply.send(ok(result));
  });

  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
    const isAdmin = (req.user.role || '').split(',').some(r => ['super_admin', 'admin'].includes(r));
    await cancelMeetingService(id, req.user.sub, reason, isAdmin);
    return reply.send(ok({ message: 'Meeting berhasil dibatalkan' }));
  });
}
