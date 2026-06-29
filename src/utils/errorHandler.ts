// ─── Global Error Handler ─────────────────────────────────────────────────────
import { FastifyError, FastifyRequest, FastifyReply } from 'fastify'
import { ZodError } from 'zod'

export class AppError extends Error {
  statusCode: number
  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
  }
}

export function errorHandler(
  error: FastifyError,
  _req: FastifyRequest,
  reply: FastifyReply,
) {
  // Zod validation error
  if (error instanceof ZodError) {
    return reply.status(422).send({
      success: false,
      error: 'Validasi gagal',
      details: error.errors.map(e => ({
        field:   e.path.join('.'),
        message: e.message,
      })),
    })
  }

  // App / business logic error
  if (error instanceof AppError || (error as any).statusCode) {
    const code = (error as any).statusCode ?? 400
    return reply.status(code).send({
      success: false,
      error: error.message,
    })
  }

  // JWT errors
  if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER' ||
      error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID' ||
      error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
    return reply.status(401).send({ success: false, error: 'Unauthorized' })
  }

  // Generic
  reply.log.error(error)
  return reply.status(500).send({
    success: false,
    error: 'Internal server error',
  })
}
