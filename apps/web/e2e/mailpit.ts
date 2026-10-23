import type { APIRequestContext } from '@playwright/test'

// Mailpit catches every email the app sends in the Docker Compose stack.
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025'

export const PASSWORD = 'correct horse battery staple 42'
export const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

export async function verificationLinkFor(request: APIRequestContext, address: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const search = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`)
    const { messages } = (await search.json()) as { messages?: { ID: string }[] }
    if (messages && messages.length > 0) {
      const message = await request.get(`${MAILPIT}/api/v1/message/${messages[0].ID}`)
      const { Text } = (await message.json()) as { Text: string }
      const link = /(https?:\/\/\S+\/verify-email#token=[A-Za-z0-9_-]+)/.exec(Text)?.[1]
      if (link) return link
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`No verification email arrived for ${address}`)
}
