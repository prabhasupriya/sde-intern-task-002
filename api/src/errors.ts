import type { ContentfulStatusCode } from 'hono/utils/http-status'

// An error we expect and know how to explain to the caller.
// index.ts turns it into `{ "error": message }` with the right status code.
export class ApiError extends Error {
  readonly status: ContentfulStatusCode

  constructor(status: ContentfulStatusCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export const notFound = (what: string) => new ApiError(404, `${what} not found`)
