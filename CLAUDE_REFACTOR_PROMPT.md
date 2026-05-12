# Prompt voor Claude in VS Code — Session token fix

> Kopieer alles vanaf "Context" en plak in Claude / Cursor.

---

## Context

In `lib/auth.ts` zit een sessietoken-probleem. De huidige `makeSessionToken()` produceert **altijd dezelfde waarde** (HMAC van de constante string `"authenticated"` met `AUTH_SECRET`). Gevolgen:
- Elke ingelogde sessie heeft dezelfde cookie-waarde.
- Als de cookie ooit gelekt wordt, is hij eeuwig geldig totdat ik `AUTH_SECRET` rouleer.
- Logout op één apparaat heeft geen invloed op andere apparaten.

**De fix:** elke login krijgt een random session-ID, ondertekend met HMAC. De cookie wordt `<sessionId>.<signature>`. Bij verificatie splits je op de punt, herbereken je de signature, en vergelijk je met `timingSafeEqual`. Geen DB-state nodig — het blijft stateless.

---

## Wat ik wil dat je doet

**1. `lib/auth.ts` aanpassen naar dit patroon:**

```ts
import { cookies } from 'next/headers'
import crypto from 'crypto'

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET environment variable is not set')
  return secret
}

function sign(sessionId: string): string {
  return crypto.createHmac('sha256', getSecret()).update(sessionId).digest('hex')
}

export function makeSessionToken(): string {
  const sessionId = crypto.randomBytes(32).toString('hex')
  return `${sessionId}.${sign(sessionId)}`
}

export async function verifyPortalAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get('portaal_session')?.value
  if (!token) return false

  const [sessionId, signature] = token.split('.')
  if (!sessionId || !signature) return false

  const expected = sign(sessionId)
  // timing-safe vergelijking
  try {
    const a = Buffer.from(signature, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
```

**2. Controleer dat de imports kloppen in:**
- `app/api/portaal/login/route.ts` — gebruikt `makeSessionToken` (signatuur ongewijzigd, geen argument)
- `app/api/portaal/settings/route.ts` — idem (heroplevering bij wachtwoordwijziging)
- `app/api/portaal/auth/route.ts` — gebruikt `verifyPortalAuth` (signatuur ongewijzigd)
- Elke andere plek waar `verifyPortalAuth` of `makeSessionToken` wordt gebruikt — niets aanpassen, alleen verifiëren dat er geen breakage is.

**3. Test dat het werkt:**
- Run `npm run build` en `npm run lint` — beide moeten slagen.
- Geen wijzigingen aan andere bestanden tenzij strikt nodig.

**4. Cleanup:**
- Verwijder `CLAUDE_REFACTOR_PROMPT.md` uit de root als die er nog staat — geen functie in productie.
- Verwijder `NEXT_PUBLIC_SUPABASE_ANON_KEY` uit `.env.example` en uit de README-tabel — wordt nergens gebruikt.

**5. Maak één commit** met message: `fix(auth): random session IDs in plaats van statisch token`.

**6. Korte afronding:** geef mij in chat een samenvatting (maximaal 5 regels) van wat er veranderd is en bevestig dat de build slaagt.

---

## Wat niet doen

- Geen DB-tabel voor sessies aanmaken (overkill voor één admin-gebruiker).
- Geen JWT-bibliotheek toevoegen — pure `crypto` is genoeg.
- Geen UI-wijzigingen.
- Geen aanpassingen aan de cookie-opties (httpOnly/secure/sameSite/maxAge blijven zoals ze zijn).
