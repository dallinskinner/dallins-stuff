import { Route, Routes } from 'react-router-dom'
import { Desktop } from './desktop/Desktop'
import { AppWindow } from './apps/AppWindow'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Desktop />}>
        <Route path="apps/:appId" element={<AppWindow />} />
      </Route>
    </Routes>
  )
}

export default App
