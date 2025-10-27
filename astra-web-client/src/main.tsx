import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { LayoutProvider } from './contexts/LayoutContext'
import './index.css'
import './styles/hebrew.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LayoutProvider>
      <App />
    </LayoutProvider>
  </React.StrictMode>,
)
