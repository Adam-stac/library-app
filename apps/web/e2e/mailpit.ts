import type { APIRequestContext } from '@playwright/test'

// Mailpit catches every email the app sends in the Docker Compose stack.
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025'

export const PASSWORD = 'correct horse battery staple 42'
export const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** Waits for an email to `address` containing a link to `page` (e.g. "verify-email") and returns the link. */
export async function emailedLink(request: APIRequestContext, address: string, page: string): Promise<string> {
  const pattern = new RegExp(`(https?://\\S+/${page}#token=[A-Za-z0-9_-]+)`)
  for (let attempt = 0; attempt < 50; attempt++) {
    const search = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`)
    const { messages } = (await search.json()) as { messages?: { ID: string }[] }
    for (const { ID } of messages ?? []) {
      const message = await request.get(`${MAILPIT}/api/v1/message/${ID}`)
      const { Text } = (await message.json()) as { Text: string }
      const link = pattern.exec(Text)?.[1]
      if (link) return link
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`No email with a ${page} link arrived for ${address}`)
}

export function verificationLinkFor(request: APIRequestContext, address: string): Promise<string> {
  return emailedLink(request, address, 'verify-email')
}
