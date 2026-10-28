export const REQUISITOS_PASSWORD =
  'Usa al menos 8 caracteres, una mayúscula, una minúscula y un número.'

export function errorPassword(password: string): string | null {
  return password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password)
    ? null
    : REQUISITOS_PASSWORD
}
