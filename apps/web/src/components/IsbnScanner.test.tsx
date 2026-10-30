import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadDecoder } from '../barcodeDecoder'
import i18n from '../i18n'
import IsbnScanner from './IsbnScanner'

vi.mock('../barcodeDecoder', () => ({ loadDecoder: vi.fn() }))

const BOOK = '9780306406157'
const SHOP_ITEM = '5012345678900'

/** A camera whose one track can be checked for being switched off */
function fakeCamera() {
  const track = { stop: vi.fn() }
  const stream = { getTracks: () => [track] } as unknown as MediaStream
  return { track, stream }
}

function useCamera(answer: () => Promise<MediaStream>) {
  const getUserMedia = vi.fn(answer)
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
  return getUserMedia
}

/** What the decoder sees, one frame after another; the last is repeated */
function decoderSeeing(...frames: string[][]) {
  let next = 0
  vi.mocked(loadDecoder).mockResolvedValue(async () => frames[Math.min(next++, frames.length - 1)])
}

describe('IsbnScanner', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { get: () => 4, configurable: true })
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'mediaDevices')
    Reflect.deleteProperty(HTMLMediaElement.prototype, 'readyState')
    Reflect.deleteProperty(document, 'hidden')
  })

  it('asks for the camera only when Scan is pressed', async () => {
    const { stream } = fakeCamera()
    const getUserMedia = useCamera(async () => stream)
    decoderSeeing([])
    const user = userEvent.setup()
    render(<IsbnScanner onFound={vi.fn()} />)

    expect(getUserMedia).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Scan barcode' }))

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1))
    expect(getUserMedia.mock.calls[0]).toEqual([expect.objectContaining({ audio: false })])
  })

  it("hands on the ISBN of a book's barcode, switches the camera off, and sends nothing anywhere", async () => {
    const { track, stream } = fakeCamera()
    useCamera(async () => stream)
    decoderSeeing([BOOK])
    const onFound = vi.fn()
    const user = userEvent.setup()
    render(<IsbnScanner onFound={onFound} />)

    await user.click(screen.getByRole('button', { name: 'Scan barcode' }))

    await waitFor(() => expect(onFound).toHaveBeenCalledWith(BOOK))
    expect(onFound).toHaveBeenCalledTimes(1)
    expect(track.stop).toHaveBeenCalled()
    expect(screen.getByText(`ISBN ${BOOK} found.`)).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("ignores a barcode that isn't an ISBN, says so, and carries on looking", async () => {
    const { stream } = fakeCamera()
    useCamera(async () => stream)
    decoderSeeing([SHOP_ITEM], [SHOP_ITEM], [BOOK])
    const onFound = vi.fn()
    const user = userEvent.setup()
    render(<IsbnScanner onFound={onFound} />)

    await user.click(screen.getByRole('button', { name: 'Scan barcode' }))

    expect(await screen.findByText("That barcode isn't an ISBN. Try the one on the back cover.")).toBeInTheDocument()
    expect(onFound).not.toHaveBeenCalled()
    await waitFor(() => expect(onFound).toHaveBeenCalledWith(BOOK), { timeout: 3000 })
  })

  it('switches the camera off when the dialog is closed with "Type it instead"', async () => {
    const { track, stream } = fakeCamera()
    useCamera(async () => stream)
    decoderSeeing([])
    const onFound = vi.fn()
    const user = userEvent.setup()
    render(<IsbnScanner onFound={onFound} />)

    await user.click(screen.getByRole('button', { name: 'Scan barcode' }))
    expect(await screen.findByText('Looking for a barcode…')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Type it instead' }))

    expect(track.stop).toHaveBeenCalled()
    expect(onFound).not.toHaveBeenCalled()
  })

  it('switches the camera off if the dialog is closed while the browser is still asking', async () => {
    const { track, stream } = fakeCamera()
    let allow: (stream: MediaStream) => void = () => {}
    useCamera(() => new Promise<MediaStream>((resolve) => (allow = resolve)))
    decoderSeeing([])
    const user = userEvent.setup()
    render(<IsbnScanner onFound={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Scan barcode' }))
    await user.click(screen.getByRole('button', { name: 'Type it instead' }))
    await act(async () => allow(stream))

    expect(track.stop).toHaveBeenCalled()
  })

  it('switches the camera off when the tab is hidden', async () => {
    const { track, stream } = fakeCamera()
    useCamera(async () => stream)
    decoderSeeing([])
    const user = userEvent.setup()
    render(<IsbnScanner onFound={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Scan barcode' }))
    await screen.findByText('Looking for a barcode…')
    Object.defineProperty(document, 'hidden', { get: () => true, configurable: true })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(track.stop).toHaveBeenCalled())
  })

  it('switches the camera off when the page is left', async () => {
    const { track, stream } = fakeCamera()
    useCamera(async () => stream)
    decoderSeeing([])
    const user = userEvent.setup()
    const { unmount } = render(<IsbnScanner onFound={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Scan barcode' }))
    await screen.findByText('Looking for a barcode…')
    unmount()

    expect(track.stop).toHaveBeenCalled()
  })

  it('says so when the camera is refused, and the way out is typing', async () => {
    useCamera(async () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' })))
    const user = userEvent.setup()
    render(<IsbnScanner onFound={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Scan barcode' }))

    expect(await screen.findByText(/The camera is turned off for this site/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Type it instead' }))
    expect(screen.getByRole('button', { name: 'Scan barcode' })).toBeInTheDocument()
  })

  it("says so when there's no camera to use, or the reader can't load", async () => {
    useCamera(async () => Promise.reject(Object.assign(new Error('none'), { name: 'NotFoundError' })))
    const user = userEvent.setup()
    render(<IsbnScanner onFound={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Scan barcode' }))

    expect(await screen.findByText("The camera can't be used here. Type the ISBN instead.")).toBeInTheDocument()
  })

  it('switches the camera off when the barcode reader fails to load', async () => {
    const { track, stream } = fakeCamera()
    useCamera(async () => stream)
    vi.mocked(loadDecoder).mockRejectedValue(new Error('chunk failed'))
    const user = userEvent.setup()
    render(<IsbnScanner onFound={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Scan barcode' }))

    expect(await screen.findByText("The camera can't be used here. Type the ISBN instead.")).toBeInTheDocument()
    expect(track.stop).toHaveBeenCalled()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    useCamera(async () => fakeCamera().stream)
    decoderSeeing([])
    const user = userEvent.setup()
    render(<IsbnScanner onFound={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'مسح الباركود' }))

    expect(await screen.findByText('جارٍ البحث عن باركود…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'اكتبه بدلًا من ذلك' })).toBeInTheDocument()
  })
})
