# MoSaidCuts – Afsprakenboekingssysteem

Next.js 16 app voor het plannen van kappersdiensten met e-mailverificatie en een beheerportaal.

---

## Vereisten

- Node.js 20+
- Een [Supabase](https://supabase.com) project
- Een Gmail-account met een App Password (of een Brevo API-sleutel als alternatief)

---

## Lokale installatie

```bash
git clone <repo-url>
cd mosaidcuts
npm install
cp .env.example .env.local
# Vul .env.local in (zie hieronder)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Omgevingsvariabelen

Kopieer `.env.example` naar `.env.local` en vul alle waarden in:

| Variabele | Beschrijving |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL van uw Supabase-project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/public key van Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (alleen server-side) |
| `AUTH_SECRET` | Willekeurig geheim voor sessiecookies — genereer met `openssl rand -hex 32` |
| `GMAIL_USER` | Gmail-adres voor het versturen van e-mails |
| `GMAIL_APP_PASSWORD` | Gmail App Password (niet uw gewone wachtwoord) |
| `BREVO_API_KEY` | Optioneel: Brevo als primaire mailer (Gmail wordt fallback) |
| `NEXT_PUBLIC_BASE_URL` | Basis-URL van de app, bijv. `https://jouwdomein.vercel.app` |

---

## Database instellen

Voer `supabase/schema.sql` uit in de Supabase SQL Editor:

1. Ga naar uw Supabase-project → SQL Editor
2. Plak de inhoud van `supabase/schema.sql` en klik op **Run**

---

## Portaalwachtwoord instellen

Het wachtwoord wordt als bcrypt-hash opgeslagen in de `settings`-tabel.

Genereer een hash:

```bash
node -e "const b=require('bcryptjs'); b.hash('jouw-wachtwoord', 12).then(h => console.log(h))"
```

Sla de hash op in Supabase:

```sql
INSERT INTO settings (key, value)
VALUES ('portal_password_hash', '$2a$12$...')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

Of log gewoon in via `/portaal` — als er nog een `portal_password` (plain text) in de database staat, wordt die automatisch gemigreerd naar een bcrypt-hash.

---

## Gmail App Password aanmaken

1. Ga naar [myaccount.google.com/security](https://myaccount.google.com/security)
2. Zet 2-stapsverificatie aan
3. Zoek op "App passwords" en maak een nieuw wachtwoord aan voor "Mail"
4. Gebruik dat 16-cijferige wachtwoord als `GMAIL_APP_PASSWORD`

---

## Deployen op Vercel

```bash
vercel --prod
```

Stel alle omgevingsvariabelen in via het Vercel-dashboard onder **Settings → Environment Variables**.

Zorg dat `NEXT_PUBLIC_BASE_URL` gelijk is aan uw productie-URL, anders wijzen annuleerlinks in e-mails naar localhost.

---

## Scripts

```bash
npm run dev    # Ontwikkelserver starten
npm run build  # Productiebuild
npm run lint   # Linting uitvoeren
```
