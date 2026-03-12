# 🏎️ F1 Fantasy TBE – Setup-Anleitung

Diese Anleitung erklärt Schritt für Schritt, wie du das Projekt einrichtest und auf GitHub hostest.

---

## Schritt 1: Supabase einrichten

### 1.1 Account erstellen
1. Gehe zu [supabase.com](https://supabase.com) und klicke auf **"Start your project"**
2. Registriere dich kostenlos (GitHub-Login empfohlen)
3. Klicke auf **"New project"**
4. Wähle:
   - **Name:** `f1-fantasy-tbe` (oder was du möchtest)
   - **Database Password:** Sicheres Passwort generieren und **speichern!**
   - **Region:** `Central EU (Frankfurt)` (am nächsten für Österreich)
5. Klicke **"Create new project"** und warte ~2 Minuten

### 1.2 Datenbank-Schema anlegen
1. Klicke links im Menü auf **"SQL Editor"**
2. Klicke auf **"New query"**
3. Öffne die Datei `supabase/schema.sql` und kopiere den **gesamten Inhalt**
4. Füge ihn im SQL Editor ein und klicke **"Run"**
5. Du solltest sehen: ✅ `Success. No rows returned`

### 1.3 Basis-Daten einfügen (Fahrer, Teams, Rennkalender)
1. Neue Query im SQL Editor
2. Öffne `supabase/seed.sql` und kopiere den **gesamten Inhalt**
3. Füge ihn ein und klicke **"Run"**

### 1.4 API-Schlüssel holen
1. Klicke links auf **"Project Settings"** (Zahnrad-Symbol)
2. Wähle **"API"**
3. Notiere dir:
   - **Project URL** (z.B. `https://abcdefgh.supabase.co`)
   - **anon public** Key (langer String unter "Project API keys")

---

## Schritt 2: Spieler-Accounts anlegen

### 2.1 Benutzer erstellen (im Supabase Dashboard)
1. Klicke links auf **"Authentication"** → **"Users"**
2. Klicke auf **"Add user"** → **"Create new user"**
3. Lege diese 4 User an:

| Name  | E-Mail (Beispiel)         | Passwort  |
|-------|---------------------------|-----------|
| Alex  | alex@tbe-fantasy.local    | TBE2026   |
| Andi  | andi@tbe-fantasy.local    | TBE2026   |
| Mandi | mandi@tbe-fantasy.local   | TBE2026   |
| Ferk  | ferk@tbe-fantasy.local    | TBE2026   |

> **Tipp:** Du kannst echte E-Mail-Adressen verwenden – dann können Spieler ihr Passwort auch per Mail zurücksetzen.

### 2.2 Profile eintragen
Nach dem Anlegen der User, führe diesen SQL aus (IDs anpassen!):

```sql
-- IDs der User findest du im Dashboard unter Authentication → Users
UPDATE public.profiles SET display_name = 'Alex', username = 'alex', is_admin = true
WHERE id = 'HIER-ALEX-UUID-EINSETZEN';

UPDATE public.profiles SET display_name = 'Andi', username = 'andi'
WHERE id = 'HIER-ANDI-UUID-EINSETZEN';

UPDATE public.profiles SET display_name = 'Mandi', username = 'mandi'
WHERE id = 'HIER-MANDI-UUID-EINSETZEN';

UPDATE public.profiles SET display_name = 'Ferk', username = 'ferk'
WHERE id = 'HIER-FERK-UUID-EINSETZEN';
```

---

## Schritt 3: Projekt lokal einrichten

### 3.1 Voraussetzungen
- [Node.js](https://nodejs.org) Version 18 oder höher
- [Git](https://git-scm.com)

### 3.2 Abhängigkeiten installieren
```bash
# Im Projektordner:
npm install
```

### 3.3 Umgebungsvariablen setzen
1. Kopiere `.env.example` zu `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Öffne `.env.local` und trage deine Supabase-Werte ein:
   ```
   VITE_SUPABASE_URL=https://DEINE-ID.supabase.co
   VITE_SUPABASE_ANON_KEY=dein-anon-key
   ```

### 3.4 Lokal testen
```bash
npm run dev
```
Öffne [http://localhost:5173/f1-fantasy/](http://localhost:5173/f1-fantasy/)

---

## Schritt 4: GitHub Pages einrichten

### 4.1 GitHub Repository erstellen
1. Gehe zu [github.com](https://github.com) und erstelle ein neues Repository
2. Name: `f1-fantasy` (wichtig: muss mit `base` in `vite.config.js` übereinstimmen!)
3. **Private** oder Public – deine Wahl
4. Noch nichts committen

### 4.2 GitHub Actions Workflow anlegen
Erstelle die Datei `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm install
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

### 4.3 Secrets in GitHub hinterlegen
1. Gehe zu deinem GitHub Repo → **Settings** → **Secrets and variables** → **Actions**
2. Klicke **"New repository secret"** und lege an:
   - `VITE_SUPABASE_URL` = deine Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = dein anon key

> ⚠️ **NIEMALS** den Service-Role-Key verwenden! Nur den `anon public` Key!

### 4.4 GitHub Pages aktivieren
1. Repo → **Settings** → **Pages**
2. Source: **"GitHub Actions"**

### 4.5 Projekt hochladen
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/DEIN-USERNAME/f1-fantasy.git
git push -u origin main
```

Nach 1-2 Minuten ist die Seite live unter:
`https://DEIN-USERNAME.github.io/f1-fantasy/`

---

## Sicherheitshinweise

- ✅ Nur `anon` Key wird im Frontend verwendet (sicher, da RLS alles schützt)
- ✅ Row Level Security ist auf allen Tabellen aktiv
- ✅ Admin-Aktionen sind durch `is_admin` Flag und RLS-Policies geschützt
- ✅ Supabase Storage für Profilbilder mit Ordner-basiertem Zugriff
- ✅ `.env.local` ist in `.gitignore` und wird nie committed
- ✅ Statische Seite = kein Server, der angegriffen werden kann

---

## Häufige Probleme

**"Invalid API key"** → `.env.local` überprüfen, `VITE_` Prefix nicht vergessen

**Weiße Seite auf GitHub Pages** → `base` in `vite.config.js` muss mit dem Repo-Namen übereinstimmen

**RLS-Fehler** → Schema nochmal ausführen, sicherstellen dass RLS aktiviert ist

---

*Projektstruktur, Schema und Basis-Konfiguration sind fertig. Nächster Schritt: Login-Seite und Navigation.*
