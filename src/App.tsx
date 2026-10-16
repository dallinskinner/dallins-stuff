import { Route, Routes } from 'react-router-dom'
import { Desktop } from './desktop/Desktop'
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
          {/* Desktop reads the URL and renders every open window itself; this route just makes the paths match. */}
          <Route path="apps/*" element={null} />
        </Route>
      </Routes>
    </>
  )
}

export default App
