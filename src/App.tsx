import { Route, Routes } from 'react-router-dom'
import { Desktop } from './desktop/Desktop'
import { AppWindow } from './apps/AppWindow'
import { Theme } from './theme/Theme'
import { Typography } from './theme/Typography'
import { DesktopLayout } from './theme/DesktopLayout'
import { WindowChrome } from './theme/WindowChrome'
import { PixelArtTheme } from './theme/PixelArtTheme'

function App() {
  return (
    <>
      <Theme />
      <Typography />
      <DesktopLayout />
      <WindowChrome />
      <PixelArtTheme />
      <Routes>
        <Route path="/" element={<Desktop />}>
          <Route path="apps/*" element={<AppWindow />} />
        </Route>
      </Routes>
    </>
  )
}

export default App
