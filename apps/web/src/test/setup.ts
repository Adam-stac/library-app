import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// How long findBy… and waitFor wait for the page to catch up (1 second by default). Searches wait for a pause in
// typing before asking the API, so on a busy machine a second can run out before the results show.
configure({ asyncUtilTimeout: 3000 })

afterEach(() => {
  cleanup()
})
