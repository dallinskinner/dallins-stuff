import { Route, Routes } from 'react-router-dom'
import { Desktop } from './desktop/Desktop'
import { AppWindow } from './apps/AppWindow'
import { Theme } from './theme/Theme'
import { Typography } from './theme/Typography'
import { DesktopLayout } from './theme/DesktopLayout'
import { WindowChrome } from './theme/WindowChrome'

function App() {
  return (
    <>
      <Theme />
      <Typography />
      <DesktopLayout />
      <WindowChrome />
      <Routes>
        <Route path="/" element={<Desktop />}>
          <Route path="apps/:appId" element={<AppWindow />} />
        </Route>
      </Routes>
    </>
  )
}

export default App
