import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Workspace from './workspace/Workspace.tsx'
import './workspace/workspace.css'

// The previous panel dashboard is still in App.tsx (styles in index.css).
// To switch back: render <App /> from './App.tsx' and import './index.css'.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Workspace />
  </StrictMode>,
)
