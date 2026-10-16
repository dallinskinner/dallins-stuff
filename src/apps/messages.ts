/** Data one app can hand to another through the window manager. To add a new kind, add a variant to
 *  this union, list its `type` in the receiving app's registry `accepts`, and handle it there with
 *  `useAppMessage`. */
export type AppMessage = PaletteMessage

export type AppMessageType = AppMessage['type']

export type AppMessageOf<T extends AppMessageType> = Extract<AppMessage, { type: T }>

export interface PaletteMessage {
  type: 'palette'
  /** Most-used first. `weight` is relative (e.g. a pixel count); receivers normalize it. */
  colors: { hex: string; weight: number }[]
}
