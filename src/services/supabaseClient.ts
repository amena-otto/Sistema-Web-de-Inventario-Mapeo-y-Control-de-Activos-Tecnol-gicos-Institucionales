
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en el archivo .env'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// Registrar antes de montar React: el SDK puede consumir el enlace al inicializarse.
// No basta con una sesión normal ni con un parámetro type=recovery en la URL.
let recoveryUserId: string | null = null
export function usuarioEnRecuperacion() {
  return recoveryUserId
}
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') recoveryUserId = session?.user.id ?? null
  else if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') recoveryUserId = null
})
