import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { Web3Provider } from './context/Web3Context.jsx'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'


ReactDOM.createRoot(document.getElementById('root')).render(
<React.StrictMode>
<Web3Provider>
<App />
<ToastContainer position="top-right" autoClose={3000} />
</Web3Provider>
</React.StrictMode>
)