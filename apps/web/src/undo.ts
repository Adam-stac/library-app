import { createContext, useContext } from 'react'

/**
 * Something just moved to the bin, with the chance to put it back (ADR 0009). `id` is the item's ID in the bin
 * (the record's own); `openAfter` is where to go once it is back, and `onUndone` lets the page show it again.
 */
export type UndoOffer = { message: string; id: string; openAfter?: string; onUndone?: () => void }

export const UndoContext = createContext<(offer: UndoOffer) => void>(() => {})

/** Shows "… moved to the bin. Undo" for a few seconds (UndoProvider, in the frame around every page) */
export function useOfferUndo(): (offer: UndoOffer) => void {
  return useContext(UndoContext)
}
