import type { SourceID } from "@shared/types"
import sourceModules from "./sources/registry"
import type { SourceGetter } from "./types"

export const getters = (function () {
  const getters = {} as Record<SourceID, SourceGetter>
  typeSafeObjectEntries(sourceModules).forEach(([id, mod]) => {
    if (mod instanceof Function) {
      Object.assign(getters, { [id]: mod })
    } else {
      Object.assign(getters, mod)
    }
  })
  return getters
})()
