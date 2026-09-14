import { Route, Routes } from 'react-router-dom'
import { Desktop } from './desktop/Desktop'
import { AppWindow } from './apps/AppWindow'
import { Theme } from './theme/Theme'
import { Typography } from './theme/Typography'

function App() {
  return (
    <>
      <Theme />
      <Typography />
      <Routes>
        <Route path="/" element={<Desktop />}>
          <Route path="apps/:appId" element={<AppWindow />} />
        </Route>
      </Routes>
    </>
  )
}

export default App
