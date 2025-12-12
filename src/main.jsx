import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import InspectorReport from './InspectorReport.jsx'
import ReconciliationDashboard from './ReconciliationDashboard.jsx'
import ChangeManagement from './ChangeManagement.jsx'
import './index.css'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Admin/Full Access - includes nav to all dashboards */}
        <Route path="/" element={<App />} />
        <Route path="/admin" element={<App />} />
        
        {/* Inspector - Clean form only, no nav buttons */}
        <Route path="/inspector" element={<InspectorReport />} />
        
        {/* Admin Dashboards */}
        <Route path="/reconciliation" element={<ReconciliationDashboard />} />
        <Route path="/changes" element={<ChangeManagement />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
