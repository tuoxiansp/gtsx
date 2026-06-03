export const importedConfig = {
  nested: {
    mode: "show",
    show: true,
  },
}

export const importedItems = [{ label: "Shown", show: true }]

const importedSpreadBase = {
  show: true,
  tone: "base",
}

export const importedSpreadConfig = {
  ...importedSpreadBase,
  tone: "final",
}

const importedSpreadItemsBase = [{ label: "Hidden", show: false }]

export const importedSpreadItems = [...importedSpreadItemsBase, { label: "Shown", show: true }]

const aliasedStatic = {
  show: true,
}

export const exportedAliasStatic = aliasedStatic

const localStatic = {
  show: true,
}

const defaultStatic = {
  show: true,
}

export { localStatic as reExportedLocalStatic }
export default defaultStatic
