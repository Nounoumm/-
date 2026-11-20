import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles/base.css'
import './styles/overrides.css'
import './styles/account.css'
import './styles/overrides.css'

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
