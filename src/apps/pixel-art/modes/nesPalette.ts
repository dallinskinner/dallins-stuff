/** The NES PPU's 64 master colors, in index order ($00–$3F). The console outputs a composite video signal, so there is no
 *  canonical RGB; this is the widely used "FBX Smooth"-style table. Several entries repeat (the many blacks). */
const NES_PALETTE_RAW = [
  '#626262', '#001fb2', '#2404c8', '#5200b2', '#730076', '#800024', '#730b00', '#522800',
  '#244400', '#005700', '#005c00', '#005324', '#003c76', '#000000', '#000000', '#000000',
  '#ababab', '#0d57ff', '#4b30ff', '#8a13ff', '#bc08d6', '#d21269', '#c72e00', '#9d5400',
  '#607b00', '#209800', '#00a300', '#009942', '#007db4', '#000000', '#000000', '#000000',
  '#ffffff', '#53aeff', '#9085ff', '#d365ff', '#ff57ff', '#ff5dcf', '#ff7757', '#fa9e00',
  '#bdc700', '#7ae700', '#43f611', '#26ef7e', '#2cd5f6', '#4e4e4e', '#000000', '#000000',
  '#ffffff', '#b6e1ff', '#ced1ff', '#e9c3ff', '#ffbcff', '#ffbdf4', '#ffc6c3', '#ffd59a',
  '#e9e681', '#cef481', '#b6fb9a', '#a9fac3', '#a9f0f4', '#b8b8b8', '#000000', '#000000',
]

/** The palette as the hardware lays it out: one column per hue ($x0 gray, $x1–$xC around the color wheel, $xD dark
 *  grays) and one row per brightness ($0x darkest at the top to $3x lightest). The unusable $xE/$xF blacks are dropped,
 *  and a color that already appeared earlier is left as an empty cell so each color is shown once. */
export const NES_GRID: (string | null)[][] = (() => {
  const seen = new Set<string>()
  return [0, 1, 2, 3].map((brightness) =>
    NES_PALETTE_RAW.slice(brightness * 16, brightness * 16 + 14).map((hex) => {
      if (seen.has(hex)) return null
      seen.add(hex)
      return hex
    }),
  )
})()

/** Distinct master colors, in grid order. */
export const NES_COLORS = NES_GRID.flat().filter((hex): hex is string => hex !== null)
