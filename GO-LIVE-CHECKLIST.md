# ITI-BO Go-Live: Analisi Critica 🔴

**Data**: 28 Aprile 2026  
**Status**: ❌ NON PRONTO PER PRODUZIONE  
**Rischio**: CRITICO — Molteplici vulnerabilità di sicurezza e mancanze funzionali

---

## 🔴 BLOCKERS CRITICI (Must Fix Before Launch)

### 1. **Segreti Commessi in Git** ⚠️ SECURITY CRITICAL
**File**: `.env` — **PROBLEMA**: Le chiavi Supabase sono in chiaro nel repository

```
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Impatto**: 
- Chiunque ha accesso al repo ha accesso al progetto Supabase
- Qualsiasi attacker può leggere/modificare dati
- SERVICE_KEY espone permessi admin

**Fix**:
```bash
# 1. IMMEDIATO: Ruota le chiavi Supabase (admin panel)
# 2. Rimuovi .env dal git history:
git filter-branch --tree-filter 'rm -f .env' HEAD

# 3. Crea .env.example:
```
VITE_SUPABASE_URL=https://xzdazmzjltxsxyqokxdh.supabase.co
VITE_SUPABASE_ANON_KEY=***REPLACE_ME***
```

# 4. Verifica che .gitignore contiene .env (già c'è, ma non funziona se il file è già commesso)
# 5. Aggiungi secret management: usa Vercel Secrets, .env.local per dev

---

### 2. **TypeScript Non Tipizzato** 🟡 QUALITY
**File**: `tsconfig.app.json`

```json
"strict": false,
"noUnusedLocals": false,
"noUnusedParameters": false,
"noImplicitAny": false
```

**Problemi**:
- `any` ovunque → bugs in produzione
- State con tipi `any` (es. `useState<any>(null)` in Leads.tsx, Dashboard.tsx, App.tsx)
- Form data senza validazione a livello di tipo

**Esempio critico** (App.tsx:21-22):
```tsx
const [session, setSession] = useState<any>(null);
const [loading, setLoading] = useState(true);
// session potrebbe essere undefined, null, con struttura sconosciuta
```

**Fix**: Abilita strict mode e scrivi type definitions:
```json
"strict": true,
"noUnusedLocals": true,
"noImplicitAny": true
```

Definisci tipi:
```tsx
interface Session {
  user: { id: string; email: string };
  access_token: string;
}

const [session, setSession] = useState<Session | null>(null);
```

---

### 3. **Zero Error Boundaries** 🔴 RELIABILITY
**Problema**: Una singola exception in qualsiasi componente crasha l'app intera

**Locazioni ad alto rischio**:
- `PropertyWizard.tsx`: Upload immagini, compressione, salvataggio DB
- `ValuationWizard.tsx`: Chiama AI, calcoli complessi
- `Dashboard.tsx`: Fetching paralleli di multiple query
- `Leads.tsx`: Operazioni batch, update form

**Esempio**: Se l'upload immagine fallisce in PropertyWizard (riga 16: `compressCopertina`), tutta la app crasha.

**Fix**: Implementa Error Boundary:
```tsx
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error, errorInfo) {
    // Log to Sentry, Datadog, etc.
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

Wrappa tutte le route in App.tsx.

---

### 4. **Nessuna Input Validation**
**Problema**: Form accettano dati sporchi, nessun validation server-side

**Esempi**:
- PropertyWizard (riga 49): `[prezzo]` — accetta `"-100"`, `"$$$"`, null
- Leads.tsx: Search query → direttamente in SQL `ilike.%${searchQuery}%` (SQL injection risk mitigato solo da Supabase RLS, non è sufficiente)
- Tasks, Immobili: no tipo checking prima di inviare a Supabase

**Fix**:
```tsx
import { z } from 'zod'; // già in dependencies!

const PropertySchema = z.object({
  titolo: z.string().min(3).max(200),
  prezzo: z.number().positive().optional(),
  mq: z.number().positive(),
  // ... rest
});

// In handleSubmit:
const validated = PropertySchema.parse(formData);
await supabase.from('immobili').insert(validated);
```

---

### 5. **Autenticazione Incompleta** 🔐
**Problemi**:

a) **No refresh token rotation**
```tsx
// src/lib/supabase.ts — manca completamente
const supabase = createClient(url, anonKey);
// Nessuna gestione di token expiry refresh
```

b) **No password reset flow**
- Solo email/password auth
- Zero UI per "forgot password"
- Users locked out se perdono password

c) **No session validation periodica**
- ProtectedRoute (App.tsx:24-28) chiama getSession() UNA SOLA VOLTA al mount
- Se la session scade, l'utente rimane in app
- onAuthStateChange subscription è impostata, ma non ha timeout

**Fix**:
```tsx
// 1. Add refresh token listener
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        console.log('Token refreshed');
      }
      if (event === 'SIGNED_OUT') {
        navigate('/login');
      }
    }
  );
  return () => subscription.unsubscribe();
}, [navigate]);

// 2. Add periodic validation
useEffect(() => {
  const interval = setInterval(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) navigate('/login');
  }, 5 * 60 * 1000); // Every 5 min
  return () => clearInterval(interval);
}, []);

// 3. Aggiungi /forgot-password route con logic
```

---

### 6. **localStorage Senza Fallback** 📱
**File**: `AdminLayout.tsx:18` — sidebar collapsed state

```tsx
const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
  try { 
    return localStorage.getItem('sidebar-collapsed') === 'true'; 
  } catch { 
    return false; // Silent fail — app continua, ma state perso
  }
});
```

**Problemi**:
- In private browsing mode, localStorage è disabilitato
- In alcuni browser/device, localStorage quota è esaurita
- Users perderanno preferenze UI senza avviso

**Fix**: Usa `sessionStorage` come fallback o sync state con Supabase:
```tsx
const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

// In effect: sync con profilo agente
useEffect(() => {
  supabase
    .from('profili_agenti')
    .select('sidebar_collapsed')
    .single()
    .then(({ data }) => setIsCollapsed(data?.sidebar_collapsed ?? false));
}, []);

const handleToggle = () => {
  setIsCollapsed(v => {
    supabase.from('profili_agenti').update({ sidebar_collapsed: !v });
    return !v;
  });
};
```

---

### 7. **Race Conditions in Autosave** 🔄
**File**: `Leads.tsx:96-100` — autosave mechanism

```tsx
const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const autoSaveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const pendingSaveRef = useRef<any | null>(null);
```

**Problema**: Code non è visibile, ma se usa un debounce pattern standard:
```tsx
useEffect(() => {
  // se user modifica lead mentre è in saving, potrebbe perdere dati
  clearTimeout(autoSaveTimerRef.current!);
  autoSaveTimerRef.current = setTimeout(() => {
    saveChanges(selectedLead); // Potrebbe essere stale
  }, 2000);
  return () => clearTimeout(autoSaveTimerRef.current!);
}, [selectedLead]); // PROBLEMA: dipendenza su selectedLead completo
```

**Fix**: Usa una queue e versioning:
```tsx
interface SavedVersion {
  version: number;
  timestamp: number;
  data: any;
}

const [version, setVersion] = useState(0);

const saveChanges = async (data: any) => {
  const currentVersion = version;
  setAutoSaveStatus('saving');
  
  try {
    const { data: saved, error } = await supabase
      .from('leads')
      .update({ ...data, _version: currentVersion })
      .eq('id', data.id)
      .eq('_version', currentVersion - 1) // Optimistic concurrency
      .select()
      .single();
    
    if (!saved) {
      // Conflict: reload da server
      showError('Conflitto: ricarica i dati');
      await fetchLeadDetail(data.id);
      return;
    }
    
    setVersion(currentVersion + 1);
    setAutoSaveStatus('saved');
  } catch (err) {
    setAutoSaveStatus('error');
  }
};
```

---

### 8. **Protezione CSRF Mancante** 🛡️
**Problema**: Form POST non hanno CSRF tokens

**Aree interessate**:
- PropertyWizard (create/update immobili)
- LeadModal (create/update leads)
- TaskModal (create tasks)
- Qualsiasi form con side effects

**Fix**: Supabase RLS mitiga parzialmente (require authenticated), ma aggiungi comunque:
```tsx
// In una rpc call:
const { data, error } = await supabase.rpc('upsert_lead', {
  p_nome: formData.nome,
  p_cognome: formData.cognome,
  p_email: formData.email,
  // ... il token JWT nel header è implicitamente il CSRF token
});

// Per operazioni dirette su tabelle (non RPC), aggiungi metadata:
await supabase
  .from('immobili')
  .insert({
    ...data,
    created_by: currentUser.id, // Traccia autore
    created_at: new Date().toISOString(),
  });
```

---

### 9. **Rate Limiting Assente** ⏱️
**Problema**: Nessuna protezione contro brute-force, spam, DoS

**Vulnerabilità**:
- Login: loop infinito su credenziali sbagliate
- Ricerca leads: query non ottimizzate, potrebbe causare scan completo
- Upload immagini: nessun limite su numero/dimensione

**Fix**:
```tsx
// Auth rate limiter
const loginAttempts = new Map<string, { count: number; time: number }>();

const checkLoginRateLimit = (email: string) => {
  const key = `login_${email}`;
  const now = Date.now();
  const record = loginAttempts.get(key) || { count: 0, time: now };
  
  if (now - record.time > 15 * 60 * 1000) { // Reset ogni 15 min
    record.count = 0;
    record.time = now;
  }
  
  if (record.count >= 5) {
    throw new Error('Troppi tentativi. Riprova tra 15 minuti');
  }
  
  record.count++;
  loginAttempts.set(key, record);
};

// In handleLogin:
const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  
  try {
    checkLoginRateLimit(email);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // ...
  } catch (err) {
    showError(err.message);
  }
};

// Image upload size limits
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const handleImageChange = (file: File) => {
  if (file.size > MAX_IMAGE_SIZE) {
    showError('Immagine troppo grande (max 5MB)');
    return;
  }
  // ...
};
```

---

### 10. **Nessun Logging/Monitoring** 📊
**Problema**: Se qualcosa va male in produzione, non hai idea di cosa

**Aree critiche senza log**:
- Auth failures
- Valutazioni AI (quando fallisce OpenAI)
- Upload immagini (errori di compressione)
- Errori Supabase
- Performance issues

**Fix**: Integra Sentry o equivalente
```tsx
import * as Sentry from "@sentry/react";

// In main.tsx
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 1.0,
});

// Wrap App
export default Sentry.withProfiler(App);

// In componenti:
try {
  const { error } = await supabase.from('immobili').insert(data);
  if (error) {
    Sentry.captureException(error, {
      tags: { feature: 'property_creation' },
      level: 'error',
    });
    showError('Errore nel salvataggio');
  }
} catch (err) {
  Sentry.captureException(err);
}
```

---

## 🟡 PROBLEMI GRAVI (Fix Prima di Lanciare)

### 11. **No Environment Documentation**
**Manca**: .env.example, setup guide

**Fix**: Crea `.env.example`:
```bash
# Supabase
VITE_SUPABASE_URL=https://xzdazmzjltxsxyqokxdh.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE

# Optional
VITE_SENTRY_DSN=https://...
VITE_API_BASE_URL=https://api.example.com
```

Crea `SETUP.md`:
```markdown
# Setup ITI-BO

1. Clone repo
2. `npm install`
3. Copy `.env.example` to `.env`
4. Get keys from Supabase dashboard
5. `npm run dev`
```

---

### 12. **No Code Splitting / Performance Issues**
**Problema**: SPA intera caricas in un bundle grosso

**Evidence**: App.tsx lazy-loads solo ValuazioneReport
```tsx
const ValuazioneReport = lazy(() => import('./pages/ValuazioneReport'));
```

Ma **non lazy-load** le altre route (Dashboard, Properties, Leads, Tasks, Agenda, Valutazioni).

**Fix**: Lazy-load tutte le route
```tsx
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Properties = lazy(() => import('./pages/Properties'));
const Leads = lazy(() => import('./pages/Leads'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Agenda = lazy(() => import('./pages/Agenda'));
const Valutazioni = lazy(() => import('./pages/Valutazioni'));

// In routes:
<Route 
  path="/" 
  element={
    <ProtectedRoute>
      <Suspense fallback={<LoadingScreen />}>
        <Dashboard />
      </Suspense>
    </ProtectedRoute>
  } 
/>
```

Verifica bundle size:
```bash
npm install --save-dev rollup-plugin-visualizer
# In vite.config.ts: aggiungi plugin
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    visualizer({ open: true })
  ]
});
```

---

### 13. **No Metadata / SEO**
**Problema**: Open house / valutazione reports non hanno OG tags

**Impatto**: Se user condivide link su WhatsApp/Facebook, preview è vuoto

**File interessato**: `ValuazioneReport.tsx` (public route!)

**Fix**: Usa Helmet (già installato!)
```tsx
import { Helmet } from 'react-helmet-async';

export const ValuazioneReport = () => {
  const { slug } = useParams();
  const [report, setReport] = useState(null);
  
  useEffect(() => {
    // Fetch report...
    setReport(data);
  }, [slug]);
  
  return (
    <>
      <Helmet>
        <title>{report?.indirizzo} - Valutazione ITI Bologna</title>
        <meta name="description" content={`Stima: €${report?.stima_max}`} />
        <meta property="og:title" content={report?.indirizzo} />
        <meta property="og:image" content={report?.image_url} />
        <meta property="og:type" content="website" />
      </Helmet>
      {/* Page content */}
    </>
  );
};
```

---

### 14. **Missing Loading States & Skeletons**
**Problemi**:
- PropertyWizard: no skeleton mentre carica proprietari
- Leads.tsx: no skeleton mentre carica lead details
- Dashboard: KPI cards non hanno skeleton

**Fix**: Implementa skeleton loaders (shadcn/ui ha Skeleton component)
```tsx
import { Skeleton } from '@/components/ui/skeleton';

const PropertyList = () => {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  
  if (loading) {
    return (
      <div className="grid gap-4">
        {Array.from({ length: 5 }).map(i => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    );
  }
  
  return (/* list */);
};
```

---

### 15. **No Password Reset / Email Verification**
**Problema**: Solo admin può creare account agenti

**Missing**:
- Self-serve sign-up con email verification
- Password reset flow
- Account recovery

**Fix**: Crea `/forgot-password` route:
```tsx
const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  
  const handleReset = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    
    if (error) showError('Errore');
    else setSubmitted(true);
  };
  
  return submitted 
    ? <div>Check email per il link</div>
    : <form onSubmit={handleReset}>
        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <Button type="submit">Reset Password</Button>
      </form>;
};

// In App.tsx:
<Route path="/forgot-password" element={<ForgotPassword />} />
<Route path="/reset-password" element={<ResetPassword />} />
```

---

### 16. **No Audit Logging**
**Problema**: Zero tracciabilità di chi ha fatto cosa

**Critico per**:
- Lead ownership / assegnazione
- Property listing changes
- Valutazione modifications
- Soft deletes

**Fix**: Crea tabella `audit_log`
```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT, -- 'INSERT', 'UPDATE', 'DELETE'
  table_name TEXT,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMP DEFAULT now()
);

-- Trigger automatici su immobili, leads, tasks
CREATE OR REPLACE FUNCTION log_immobili_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    TG_OP,
    'immobili',
    NEW.id,
    row_to_json(OLD),
    row_to_json(NEW)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER immobili_audit
AFTER INSERT OR UPDATE OR DELETE ON immobili
FOR EACH ROW EXECUTE FUNCTION log_immobili_changes();
```

---

### 17. **Missing Data Backups & Recovery**
**Problema**: Zero disaster recovery plan

**Checklist**:
- [ ] Supabase backups abilitati? (Verifica dashboard)
- [ ] Export settimanale dei dati critici (leads, immobili, valutazioni)?
- [ ] Piano di restore documentato?

**Fix**:
```typescript
// Script: backup_to_s3.ts
import { supabase } from '@/lib/supabase';
import AWS from 'aws-sdk';

const s3 = new AWS.S3({ region: 'eu-west-1' });

export const backupDatabase = async () => {
  const tables = ['leads', 'immobili', 'valutazioni', 'tasks'];
  
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw error;
    
    await s3.putObject({
      Bucket: 'iti-backups',
      Key: `${table}_${new Date().toISOString()}.json`,
      Body: JSON.stringify(data),
    }).promise();
  }
};

// Cron job: esegui giornalmente
```

---

### 18. **No Data Validation on Server**
**Problema**: Client-side validation non è sufficiente

**Rischio**: 
- User disabilita JS → spamma dati sporchi
- Attacker modifica RLS bypass (unlikely con RLS, ma comunque risky)
- Form injection

**Fix**: Valida su Supabase (RPC o trigger)
```sql
CREATE OR REPLACE FUNCTION validate_immobile()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate required fields
  IF NEW.titolo IS NULL OR LENGTH(NEW.titolo) < 3 THEN
    RAISE EXCEPTION 'Titolo must be at least 3 chars';
  END IF;
  
  -- Validate price
  IF NEW.prezzo IS NOT NULL AND NEW.prezzo <= 0 THEN
    RAISE EXCEPTION 'Prezzo must be positive';
  END IF;
  
  -- Validate email format if presente
  IF NEW.proprietario_email IS NOT NULL 
     AND NEW.proprietario_email !~ '^\S+@\S+\.\S+$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_immobile_insert
BEFORE INSERT ON immobili
FOR EACH ROW EXECUTE FUNCTION validate_immobile();
```

---

## 🟢 MEDIUM PRIORITY (Fix Within 2 Weeks)

### 19. **No Testing Suite**
- [ ] Zero unit tests
- [ ] Zero integration tests
- [ ] Zero E2E tests

**Minimally Required**:
```bash
npm install --save-dev vitest @testing-library/react jsdom

# package.json
"test": "vitest"
```

**Example test**:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Login } from './Login';

describe('Login', () => {
  it('renders email input', () => {
    render(<Login />);
    expect(screen.getByPlaceholderText('nome@esempio.it')).toBeInTheDocument();
  });
});
```

---

### 20. **No Accessibility (a11y)**
- [ ] Nessun testing con screen reader
- [ ] Colors non hanno sufficiente contrasto (es. teal brand?)
- [ ] Missing ARIA labels

**Fix**:
```bash
npm install --save-dev @axe-core/react
# o usa: https://www.deque.com/axe/devtools/
```

**Checklist WCAG 2.1 AA**:
- [ ] Tutti i input hanno `<label>` con `htmlFor`
- [ ] Bottoni hanno testo, non solo icone
- [ ] Colori non sono solo indicator (es. "Rosso = Errore")
- [ ] Focus states visibili (`:focus-visible`)

---

### 21. **Missing Duplicate Lead Detection**
**Problema**: Il TODO in CLAUDE.md dice
> "ITI2.0 ContactForm — required client-side hardening (TODO)"

**Rischio**: 
- Contact form spam non è 100% bloccato (solo 24h guard, può essere riempito)
- Leads duplicati ancora possibili

**Fix**: Migliora `upsert_lead` RPC:
```sql
CREATE OR REPLACE FUNCTION upsert_lead(
  p_nome TEXT, p_cognome TEXT, p_email TEXT, p_telefono TEXT,
  p_messaggio TEXT DEFAULT NULL, p_immobile_id UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_existing_id UUID;
  v_created_at TIMESTAMP;
BEGIN
  -- Check for recent duplicate (24h)
  SELECT id, created_at INTO v_existing_id, v_created_at
  FROM leads
  WHERE email = p_email AND created_at > NOW() - INTERVAL '24 hours';
  
  IF v_existing_id IS NOT NULL THEN
    -- Silently ignore (prevent spam)
    RETURN json_build_object('status', 'duplicate', 'id', v_existing_id);
  END IF;
  
  -- Check for existing by email OR phone
  SELECT id INTO v_existing_id FROM leads 
  WHERE email = p_email OR telefono = p_telefono
  LIMIT 1;
  
  IF v_existing_id IS NOT NULL THEN
    -- Update existing
    UPDATE leads SET
      nome = COALESCE(p_nome, nome),
      cognome = COALESCE(p_cognome, cognome),
      telefono = COALESCE(p_telefono, telefono),
      updated_at = NOW()
    WHERE id = v_existing_id
    RETURNING json_build_object('status', 'updated', 'id', id) INTO v_result;
    
    RETURN v_result;
  ELSE
    -- Create new
    INSERT INTO leads (nome, cognome, email, telefono, messaggio)
    VALUES (p_nome, p_cognome, p_email, p_telefono, p_messaggio)
    RETURNING json_build_object('status', 'created', 'id', id) INTO v_result;
    
    RETURN v_result;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

---

### 22. **No Data Export / Reporting**
**Manca**:
- CSV export di leads
- Excel export di immobili
- PDF reports (valutazioni hanno report, ma non scaricabili?)

**Fix**: Aggiungi export buttons
```tsx
const exportLeadsToCSV = async () => {
  const { data, error } = await supabase.from('leads').select('*');
  if (error) { showError('Export failed'); return; }
  
  const csv = [
    ['Nome', 'Cognome', 'Email', 'Telefono', 'Stato'],
    ...data.map(l => [l.nome, l.cognome, l.email, l.telefono, l.stato])
  ]
    .map(row => row.join(','))
    .join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leads_${new Date().toISOString()}.csv`;
  a.click();
  showSuccess('Leads esportati');
};
```

---

### 23. **Missing Mobile Optimization**
**Evidence**: `use-mobile.tsx` hook exists, but usage inconsistent

**Checklist**:
- [ ] Login page responsive?
- [ ] Properties list pagina mobile-friendly?
- [ ] Modals non a full-screen su mobile?
- [ ] Images non oversized su mobile?

**Fix**: Test su iPhone 12 / Android
```bash
# Device emulation in Chrome DevTools (Cmd+Shift+I)
# Simula: iPhone 12, Pixel 5, iPad

# O: physical test
```

---

## ✅ DONE (But Verify)

- [x] Authentication guard (ProtectedRoute)
- [x] RLS policies on tables
- [x] Image compression (imageCompression.ts)
- [x] Toast notifications (showSuccess/showError)
- [x] Sidebar navigation
- [x] Responsive grid layouts (Tailwind)
- [x] Zod installed (for validation, not used yet)
- [x] React Query installed (not heavily used)

---

## 📋 GO-LIVE CHECKLIST

**Before Deploying to Production:**

### Security
- [ ] Rotate Supabase keys (CRITICAL)
- [ ] Remove .env from git history
- [ ] Enable 2FA on Supabase admin account
- [ ] Verify RLS policies are applied to ALL tables
- [ ] Add CSRF protection on forms
- [ ] Implement rate limiting on auth endpoints
- [ ] Add logging / error tracking (Sentry)
- [ ] Enable HTTPS only (Vercel default)

### Functionality
- [ ] Error Boundary component + integrate in all routes
- [ ] Enable TypeScript strict mode
- [ ] Add input validation (Zod) on all forms
- [ ] Test password reset flow (create flow)
- [ ] Test session expiry + token refresh
- [ ] Test autosave (concurrent edits)
- [ ] Test image upload (error cases)
- [ ] Test PDF export / report generation
- [ ] Test all forms on mobile

### Performance
- [ ] Lazy-load all route components
- [ ] Check bundle size (< 300KB main bundle)
- [ ] Test on 3G connection
- [ ] Implement image optimization (next-gen formats)
- [ ] Set up CDN for static assets

### Data
- [ ] Configure automatic backups (Supabase)
- [ ] Document data recovery process
- [ ] Add audit logging to critical tables
- [ ] Verify data retention policies
- [ ] Test RLS policies with multiple users

### Monitoring
- [ ] Set up error tracking (Sentry)
- [ ] Set up performance monitoring
- [ ] Set up uptime monitoring
- [ ] Configure alerts for errors

### Documentation
- [ ] Write .env.example with all vars
- [ ] Write SETUP.md for developers
- [ ] Write ops runbook (how to recover, debug, scale)
- [ ] Document API changes / breaking changes

---

## 🚀 DEPLOYMENT STRATEGY

**Phase 1: Staging (Week 1)**
- Deploy to Vercel staging
- Run internal UAT (Marco + 1 agent)
- Fix bugs reported
- Load test with simulated data

**Phase 2: Soft Launch (Week 2)**
- Deploy to production
- Invite 1-2 beta agents
- Monitor errors closely
- Gather feedback

**Phase 3: Full Launch (Week 3)**
- Onboard all agents
- Run training
- Disable old system

---

## 📞 CONTACT FOR ISSUES

Report issues to: `marcoferrari.wk@gmail.com`

---

**Generated**: 2026-04-28  
**Status**: CRITICAL — Do not deploy without fixing Section 🔴
