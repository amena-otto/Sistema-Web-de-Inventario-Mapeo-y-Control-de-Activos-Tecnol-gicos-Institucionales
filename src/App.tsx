import { useEffect, useState } from 'react'
import { supabase } from './services/supabaseClient.ts/index'

function App() {
  const [estado, setEstado] = useState('Comprobando conexión...')

  useEffect(() => {
    supabase.auth.getSession().then(({ error }) => {
      setEstado(error ? `Error: ${error.message}` : 'Conectado a Supabase ✔')
    })
  }, [])

  return <h1 className="p-6 text-3xl font-bold text-blue-600">{estado}</h1>
}

export default App