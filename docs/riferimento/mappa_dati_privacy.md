# Mappa dei trattamenti dati — Il Tuo Immobiliare (CRM ITI-BO + sito pubblico ITI2.0)

Documento tecnico ricostruito dal codice sorgente (2026-08-21) per un esperto privacy/DPO.
Copre due repository correlati: **ITI-BO** (CRM interno, questo repo) e **ITI2.0** (sito
pubblico `iltuoimmobiliare.it`, repo sibling). Non sostituisce un audit legale: segnala dove
il codice diverge da quanto dichiarato nell'informativa già pubblicata.

## 1. Sistemi che conservano/elaborano dati

| Sistema | Ruolo | Dati coinvolti | Localizzazione |
|---|---|---|---|
| **Supabase** (progetto `xzdazmzjltxsxyqokxdh`, "IlTuoImmobiliare") | Database Postgres primario + Auth + Storage | Tutti i dati CRM: lead (nome, cognome, email, telefono, budget), immobili, task, valutazioni, note, profili agenti, transazioni chiuse | **Regione `eu-west-2` = Londra (UK)**, non Francoforte (vedi §3, gap) |
| **Supabase Storage**, bucket `immobili` | Immagini immobili | Foto degli annunci, `getPublicUrl` → **bucket pubblico** (inteso: marketing, nessun dato personale nelle foto immobiliari) | Stessa regione del progetto |
| **Google Drive** (account Google dedicato) | Documenti immobile (checklist: APE, atti, provvigioni ecc.) | File potenzialmente con dati personali (es. Allegato A provvigioni) | Google, regione non specificata nel repo — da verificare con l'account che gestisce lo script |
| **Google Apps Script** (Web App standalone) | Proxy verso Drive, chiamato da Edge Function `drive-documenti` con token condiviso | Metadati file (immobile, fase, nome documento) + contenuto file in base64 | Google infrastructure |
| **OpenAI API** (`api.openai.com`) | Generazione valutazioni AI (Edge Function `generate-evaluation`) | Indirizzo, città, superficie, tipologia, comfort dell'immobile | **USA** |
| **Resend** (`api.resend.com`) | Invio email transazionali (notifica nuovo lead) | Dati del lead appena creato | Dichiarato in Privacy Policy ITI2.0 |
| **Nominatim / OpenStreetMap** | Geocoding indirizzo (`geocode-address`) | Indirizzo testuale | Infrastruttura OSM (EU-based, no-profit) |
| **Overpass API / OpenStreetMap** | Ricerca POI vicini a un immobile (`generate-evaluation`) | Coordinate lat/lng (non dati personali diretti) | Infrastruttura OSM |
| **Sentry** (`@sentry/react`) | Error tracking + session replay | Errori applicativi; session replay con `maskAllText: true, blockAllMedia: true` (testo mascherato, media bloccati) | Da verificare regione org Sentry (US o EU a seconda del piano) |
| **Cloudflare Workers** (`iltuoimmobiliare.it`, repo ITI2.0, `wrangler.jsonc`) | Hosting sito pubblico | Traffico HTTP, IP visitatori | Rete globale Cloudflare |
| **Hosting frontend CRM (ITI-BO)** | — | — | **Non documentato nel repo** — `docs/RUNBOOK.md` rimanda esplicitamente a "chi gestisce il dominio ITI"; nessun file di config hosting trovato nel repo |

## 2. Dati raccolti per canale

- **CRM interno (ITI-BO)**: inseriti manualmente dagli agenti — lead, immobili, task, note, valutazioni, transazioni.
- **Sito pubblico ITI2.0**:
  - `ContactForm.tsx` → RPC `upsert_lead` (nome, cognome, email, telefono, messaggio) — hardening lato client presente (cooldown 30s, regex email) oltre ai controlli DB.
  - `OpenHouseBooking.tsx` → tabella `prenotazioni_oh` — **nessun hardening equivalente** (nessun cooldown/anti-spam client-side), gap noto già segnalato in `CLAUDE.md` di questo repo.
  - Richiesta valutazione → genera un `valutazioni` con report pubblico su URL `/report/:slug`.

## 3. Gap trovati tra codice e Privacy Policy pubblicata (`ITI2.0/src/pages/Privacy.tsx`)

La Privacy Policy (ultimo aggiornamento aprile 2026, sezione 5) dichiara:
> "I dati non vengono trasferiti al di fuori dello Spazio Economico Europeo (SEE)" e cita solo
> **Supabase/Cloudflare (Francoforte)** e **Resend** come responsabili esterni.

Riscontro nel codice:

1. **OpenAI (USA) non è menzionato** — ma `generate-evaluation` invia dati dell'immobile (indirizzo, città, superficie, tipologia) a `api.openai.com` per generare la stima. È un trasferimento extra-SEE non coperto dalla policy attuale.
2. **Google Drive/Apps Script non è menzionato** — i documenti immobiliari (potenzialmente con dati personali di terzi, es. atti/provvigioni) transitano e si depositano su Google Drive, non su Supabase come lascia intendere la sezione 4 ("Il nostro database... è protetto da RLS").
3. **Regione Supabase dichiarata errata**: la policy dice "Francoforte" ma il progetto attivo è in `eu-west-2` (**Londra, UK**). Il Regno Unito ha una decisione di adeguatezza UE, quindi il trasferimento resta lecito, ma l'informativa contiene un'affermazione fattualmente imprecisa (sia sulla città sia implicitamente sul fatto che UK non è UE/SEE).
4. **Sentry non è menzionato** tra i responsabili, pur raccogliendo dati di errore/telemetria (mitigati da masking, ma non del tutto assenti — es. IP, URL con eventuali parametri).
5. **Retention dichiarata (24 mesi lead, 10 anni clienti) non è automatizzata**: nel database esiste solo un cron che elimina i `tasks` completati; non c'è alcun meccanismo automatico che cancelli/anonimizzi `leads` o `valutazioni` dopo 24 mesi. Oggi la cancellazione, se avviene, è manuale.
6. **Pagina pubblica `/report/:slug`** (`ValuazioneReport.tsx`) espone indirizzo, comune, superficie e valore stimato via meta tag `og:title`/`og:description` (condivisione social) **senza `noindex`** — a differenza di `/privacy` in ITI2.0 che ha correttamente `<meta name="robots" content="noindex, nofollow" />`. Se lo slug è indovinabile o il link viene condiviso, il report è potenzialmente indicizzabile da motori di ricerca.

## 4. Punti da portare all'esperto privacy

1. Aggiornare la Privacy Policy per includere **OpenAI** (trasferimento extra-SEE, verificare se coperto da Data Privacy Framework/SCC) e **Google Drive/Apps Script**.
2. Correggere il riferimento a "Francoforte" con la regione reale (Londra, UK) e verificare/richiamare esplicitamente l'adeguatezza UK.
3. Valutare se implementare la cancellazione/anonimizzazione automatica a 24 mesi già promessa in policy, o correggere la policy se resterà manuale.
4. Decidere se aggiungere `noindex` (o un controllo di scadenza/autenticazione) alla pagina `/report/:slug`.
5. Verificare regione/DPA di Sentry e valutare se citarlo nei responsabili esterni.
6. Chiarire dove gira in produzione il frontend CRM (ITI-BO) — non tracciato nel repo.
7. Valutare hardening anti-spam su `OpenHouseBooking.tsx` (gap già noto, non specificamente privacy ma collegato a raccolta dati non richiesti/abusivi).
8. Verificare il DPA con Google per l'account che ospita lo script Apps Script/Drive (account personale vs Workspace aziendale — cambia la responsabilità contrattuale).

## 5. Cosa NON risulta essere un problema

- RLS attiva sulla maggior parte delle tabelle CRM (`authenticated` only) — **con due eccezioni concrete trovate in produzione, vedi §6 punto 6 sotto**: `prenotazioni_oh` e `valutazioni` hanno policy che espongono dati a `anon`/`public` oltre a quanto documentato in `CLAUDE.md`.
- Nessun dato di minori o sanitario trattato (confermato in `docs/STATO.md`).
- Sentry configurato con masking testo/media attivo di default.
- Il form di contatto pubblico ha già hardening anti-abuso (cooldown, regex, dedup 24h lato RPC).
- Le tre pagine legali (Privacy/Terms/Cookies) esistono e sono linkate da footer + cookie banner in ITI2.0.
- Nessun sistema di pagamento/abbonamento in nessuno dei due repo (verificato: nessuna dipendenza Stripe/billing, nessun flusso di checkout).
- Nessun chatbot conversazionale/companion: l'unico uso di AI è una chiamata one-shot a OpenAI per generare una stima immobiliare, non un'interazione conversazionale con memoria tra sessioni.

## 6. Checklist di compliance (10 punti) — verifica puntuale sul codice

Verificato il 2026-08-21 leggendo codice sorgente + query dirette su `pg_policies`/`pg_catalog`
del progetto Supabase di produzione (`xzdazmzjltxsxyqokxdh`). Nota di contesto: la checklist è
scritta per un SaaS US-facing (richiami a CCPA/California, regole FTC, leggi NY/CA sui chatbot).
Il Titolare qui è **Il Tuo Immobiliare S.r.l., agenzia con sede a Ranica (BG)**, soggetta a
GDPR/normativa italiana, non a CCPA — i principi sostanziali (dire cosa si raccoglie, chi lo
riceve, cancellare quando promesso, non lasciare dati aperti, non fingere recensioni) restano
comunque validi indipendentemente dalla giurisdizione, e sono stati verificati come tali.

| # | Voce | Verdetto |
|---|---|---|
| 1 | Nessuna privacy policy | **PASS** |
| 2 | Policy non dice quali dati raccoglie | **PASS** |
| 3 | Policy non dice che si usa AI | **FAIL** |
| 4 | Policy non nomina le terze parti | **FAIL** |
| 5 | Upload/dati promessi cancellati ma non cancellati | **FAIL** |
| 6 | Bucket/tabelle aperte al pubblico | **FIXED (2026-08-21)** — vedi dettaglio sotto |
| 7 | Testimonianze da persone inesistenti | **CAN'T TELL DAL CODICE** |
| 8 | Cancellazione più difficile della sottoscrizione | **N/A** |
| 9 | Free trial con addebito automatico senza avviso | **N/A** |
| 10 | Chatbot senza risposta al self-harm | **N/A** |

### 1. Nessuna privacy policy — PASS

`ITI2.0/src/pages/Privacy.tsx` esiste, è redatta ai sensi degli artt. 13-14 GDPR, ha
`<meta name="robots" content="noindex, nofollow" />`, ed è linkata da `Footer.tsx` e da
`CookieBanner.tsx` (confermato in `ITI2.0/CLAUDE.md`). Esistono anche `Terms.tsx` e
`CookiePolicy.tsx`. Nessuna azione richiesta.

### 2. Policy non dice quali dati raccoglie — PASS

`Privacy.tsx` sezione 2 elenca: dati anagrafici/contatto (nome, cognome, email, telefono), dati
immobiliari, dati di navigazione — e cita esplicitamente i moduli (contatto, prenotazione Open
House, richiesta valutazione) che corrispondono a `leads`, `prenotazioni_oh`, `valutazioni` nel
DB. Copertura adeguata delle tabelle realmente popolate da utenti esterni.

### 3. Policy non dice che si usa AI — FAIL

`supabase/functions/generate-evaluation/index.ts:540` invia a `api.openai.com` indirizzo, città,
superficie, tipologia e comfort dell'immobile per generare la stima. `ITI2.0/src/pages/Privacy.tsx`
non menziona OpenAI né l'uso di AI generativa in nessuna sezione.

**Fix — diff a `ITI2.0/src/pages/Privacy.tsx`, sezione 3 (Finalità):**
```diff
               <div className="border-l-2 border-[#94b0ab]/30 pl-4">
                 <p><strong className="text-[#1a1a1a]">B. Valutazione Immobiliare:</strong> Per erogare il servizio di stima e generare il report di valutazione del tuo immobile, e per le comunicazioni ad esso collegate.</p>
                 <p className="text-sm mt-1 italic">Base giuridica: Esecuzione di misure precontrattuali o di un contratto (Art. 6, lett. b, GDPR).</p>
+                <p className="text-sm mt-2">Per generare la stima automatica utilizziamo un servizio di intelligenza artificiale di terze parti (OpenAI). I dati dell'immobile (indirizzo, città, superficie, tipologia, caratteristiche) vengono inviati a tale servizio esclusivamente per calcolare la stima; non vengono utilizzati da OpenAI per addestrare i propri modelli (opt-out API).</p>
               </div>
```
*(Verificare presso OpenAI l'effettiva impostazione no-training per le chiamate API prima di
pubblicare questa frase — di default le chiamate via API non sono usate per training, ma va
confermato che non sia stata attivata alcuna condivisione dati.)*

### 4. Policy non nomina le terze parti — FAIL

Sezione 5 nomina solo Supabase, Cloudflare, Resend. Mancano: **OpenAI** (vedi punto 3), **Google
Drive/Google Apps Script** (`google-apps-script/DocumentiDrive.gs`, proxy
`supabase/functions/drive-documenti/index.ts` — ospita i documenti immobiliari, potenzialmente
con dati personali di terzi come l'Allegato A provvigioni), **Sentry** (error tracking).

**Fix — diff a `ITI2.0/src/pages/Privacy.tsx`, sezione 5:**
```diff
               <li><strong className="text-[#1a1a1a]">Fornitori di servizi Cloud e Database:</strong> Per l&apos;archiviazione sicura dei dati (es. Supabase, Cloudflare) i cui server sono localizzati all&apos;interno dell&apos;Unione Europea (es. Francoforte).</li>
               <li><strong className="text-[#1a1a1a]">Fornitori di servizi Email:</strong> Per l&apos;invio automatizzato dei report di valutazione o delle conferme di appuntamento (es. Resend).</li>
+              <li><strong className="text-[#1a1a1a]">Fornitori di servizi AI:</strong> Per la generazione automatica delle stime immobiliari (OpenAI, con sede negli Stati Uniti — trasferimento coperto da clausole contrattuali tipo/Data Privacy Framework).</li>
+              <li><strong className="text-[#1a1a1a]">Archiviazione documentale:</strong> I documenti relativi agli immobili (es. APE, atti) sono conservati su Google Drive tramite un'applicazione dedicata (Google).</li>
+              <li><strong className="text-[#1a1a1a]">Monitoraggio errori tecnici:</strong> Per individuare e correggere malfunzionamenti del sito/gestionale (Sentry).</li>
               <li><strong className="text-[#1a1a1a]">Consulenti e tecnici IT:</strong> Incaricati dello sviluppo e della manutenzione del nostro sito web e gestionale, vincolati da rigorosi accordi di riservatezza.</li>
```
**Nota fattuale da correggere nella stessa sezione**: il progetto Supabase di produzione è
verificato in regione **`eu-west-2` (Londra, UK)**, non Francoforte. Il Regno Unito ha una
decisione di adeguatezza UE (trasferimento lecito), ma la frase attuale è imprecisa e va
corretta:
```diff
-              <li><strong className="text-[#1a1a1a]">Fornitori di servizi Cloud e Database:</strong> Per l&apos;archiviazione sicura dei dati (es. Supabase, Cloudflare) i cui server sono localizzati all&apos;interno dell&apos;Unione Europea (es. Francoforte).</li>
+              <li><strong className="text-[#1a1a1a]">Fornitori di servizi Cloud e Database:</strong> Per l&apos;archiviazione sicura dei dati (es. Supabase, Cloudflare). Il database è ospitato nel Regno Unito, Paese che beneficia di una decisione di adeguatezza della Commissione Europea ai sensi dell'art. 45 GDPR.</li>
```

### 5. Dati promessi cancellati ma non cancellati — FAIL

`Privacy.tsx` sezione 6 promette cancellazione dei lead non convertiti dopo **24 mesi**. Verificato
via query diretta su `cron.job` (vedi anche `CLAUDE.md` di questo repo): l'unico cron esistente è
`pulizia-task-bimensile`, che cancella solo `tasks` completati. **Nessun job cancella o anonimizza
`leads`, `valutazioni` o `prenotazioni_oh` dopo 24 mesi.** La promessa scritta non corrisponde a
nessun meccanismo tecnico.

**Fix — nuova migration che aggiunge il job mancante (schema soft-delete già esistente su
`leads`: colonne `is_deleted`/`deleted_at` già presenti in produzione):**
```sql
-- supabase/migrations/xxxxxxxxxxxxxx_retention_leads_24_mesi.sql
create or replace function public.anonimizza_lead_scaduti()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.leads
  set nome = 'Lead', cognome = 'anonimizzato', email = null, telefono = null,
      telefono_clean = null, note_interne = null, messaggio = null,
      is_deleted = true, deleted_at = now()
  where is_deleted = false
    and stato not in ('Chiuso')          -- da confermare col Titolare: quali stati contano come "seguiti da incarico"
    and created_at < now() - interval '24 months';
end;
$$;

select cron.schedule(
  'anonimizza-lead-scaduti-mensile',
  '0 3 1 * *',
  $$select public.anonimizza_lead_scaduti();$$
);
```
*Va replicato un job equivalente per `valutazioni` non seguite da incarico. **La regola esatta
("non seguita da incarico" = quali valori di `stato`) deve essere confermata dal Titolare prima
di attivare il job** — qui è solo lo scheletro tecnico.*

### 6. Bucket/tabelle aperte al pubblico — FIXED (2026-08-21, applicato in produzione)

Verificato con query dirette su `pg_policies` del progetto di produzione (non solo lettura del
file di migration, che può essere superato da modifiche successive non riportate nel repo).
Entrambi i fix sotto sono stati **applicati e verificati in produzione** tramite:
- `supabase/migrations/20260821120000_fix_rls_prenotazioni_e_valutazioni_pubbliche.sql`
- `supabase/migrations/20260821121500_widen_public_valuation_report_rpc.sql` (allarga la RPC
  a tutte le colonne che il report pubblico effettivamente mostra, dopo aver verificato che la
  prima versione ne esponeva solo un sottoinsieme minimo)
- diff frontend applicato a `src/pages/ValuazioneReport.tsx` (vedi 6b)

Verifica post-deploy eseguita via query dirette su `pg_policies` / `has_function_privilege` sul
progetto `xzdazmzjltxsxyqokxdh`: la policy pubblica su `prenotazioni_oh` non esiste più, `valutazioni`
ha solo policy `{authenticated}`, e `anon` ha `EXECUTE` sulla nuova funzione RPC.

**6a — `prenotazioni_oh`: chiunque, senza login, poteva leggere nome/email/telefono di ogni
prenotazione Open House mai fatta, per qualsiasi immobile. RISOLTO.**

`supabase/migrations/00000000000000_baseline.sql:630-632`:
```sql
CREATE POLICY "Permetti lettura prenotazioni" ON public.prenotazioni_oh
    AS PERMISSIVE FOR SELECT TO public
    USING (true);
```
Colonne esposte: `nome`, `email`, `telefono`, `orario_scelto`. Verificato che il frontend
(`ITI2.0/src/components/OpenHouseBooking.tsx:71-78`) **non legge mai questa tabella** — fa solo
`INSERT`. La policy di lettura pubblica non serve a nessuna funzionalità reale, è pura
esposizione. Chiunque conosca l'URL del progetto Supabase (pubblico, è nel bundle JS del sito)
può fare `GET /rest/v1/prenotazioni_oh?select=*` e scaricare tutti i contatti.

**Fix applicato:**
```diff
-CREATE POLICY "Permetti lettura prenotazioni" ON public.prenotazioni_oh
-    AS PERMISSIVE FOR SELECT TO public
-    USING (true);
+CREATE POLICY "Agenti autenticati leggono prenotazioni" ON public.prenotazioni_oh
+    AS PERMISSIVE FOR SELECT TO authenticated
+    USING (true);
```
(`AttendeesSheet.tsx` nel CRM gira sempre con utente autenticato, quindi non si è rotto nulla —
verificato che nessuna funzionalità pubblica legge questa tabella.)

**6b — `valutazioni`: chiunque poteva scaricare l'intera tabella delle stime immobiliari — indirizzo,
comune, superficie, valore stimato minimo/massimo, nota AI — non solo la singola riga di uno
slug conosciuto. RISOLTO.**

`supabase/migrations/00000000000000_baseline.sql:722` (verificato anche in `pg_policies` live):
```sql
CREATE POLICY "val_public_report" ON public.valutazioni
    AS PERMISSIVE FOR SELECT TO anon
    USING (slug IS NOT NULL);
```
Il problema: la condizione è `slug IS NOT NULL`, **non** "slug = quello richiesto". RLS filtra
per riga, non per query: qualunque client con la chiave `anon` (pubblica, nel bundle JS) può
chiamare `GET /rest/v1/valutazioni?select=*` **senza specificare alcuno slug** e ricevere ogni
valutazione mai creata con uno slug — comprese le bozze (`ValuationWizard.tsx:454-458` assegna lo
slug già allo stato `Bozza`, prima ancora che l'agente completi/riveda la stima). Non serve
indovinare nulla: la pagina pubblica (`ValuazioneReport.tsx:308-312`) filtra per slug lato
client, ma la tabella resta interamente leggibile lato server per chiunque interroghi l'API
direttamente.

**Fix applicato: la policy è stata sostituita con una funzione RPC che espone una sola riga per
slug esatto (stesso pattern già usato per `upsert_lead`).** La prima versione (migration
`20260821120000`) esponeva solo 11 colonne minime; è stata subito allargata (migration
`20260821121500`, richiede `DROP FUNCTION` prima perché Postgres non permette di cambiare le
`OUT` di una funzione esistente con `CREATE OR REPLACE`) a ~40 colonne + `zone_omi` in join, per
replicare esattamente ciò che `ValuazioneReport.tsx` mostra, **esclusi** `lead_id`/`agente_id`
(mai mostrati e non necessari al pubblico):
```sql
DROP FUNCTION IF EXISTS public.get_public_valuation_report(text);

CREATE FUNCTION public.get_public_valuation_report(p_slug text)
RETURNS TABLE (
  id uuid, indirizzo text, citta text, tipologia text, superficie_mq integer, piano text,
  num_locali integer, num_camere integer, num_bagni integer, anno_costruzione integer,
  stato_conservativo text, classe_energetica text, tipo_riscaldamento text, ha_box boolean,
  ha_posto_auto boolean, ha_cantina boolean, ha_giardino boolean, ascensore boolean,
  ha_terrazzo boolean, terrazzo_mq integer, anno_ristrutturazione integer,
  dotazioni_extra text[], note_tecniche text, stima_min numeric, stima_max numeric,
  stima_breakdown jsonb, motivazione_ai text, trend_mercato_locale jsonb, descrizione_zona text,
  stima_ristrutturato_min integer, stima_ristrutturato_max integer, costo_stima_lavori integer,
  tempo_mercato text, identikit_compratore text, narrativa_dotazioni text, poi_summary text,
  comparabili_attivi jsonb, latitudine numeric, longitudine numeric, stato text,
  created_at timestamptz, slug text, zone_omi jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT v.id, v.indirizzo, v.citta, v.tipologia, v.superficie_mq, v.piano, v.num_locali,
         v.num_camere, v.num_bagni, v.anno_costruzione, v.stato_conservativo,
         v.classe_energetica, v.tipo_riscaldamento, v.ha_box, v.ha_posto_auto, v.ha_cantina,
         v.ha_giardino, v.ascensore, v.ha_terrazzo, v.terrazzo_mq, v.anno_ristrutturazione,
         v.dotazioni_extra, v.note_tecniche, v.stima_min, v.stima_max, v.stima_breakdown,
         v.motivazione_ai, v.trend_mercato_locale, v.descrizione_zona,
         v.stima_ristrutturato_min, v.stima_ristrutturato_max, v.costo_stima_lavori,
         v.tempo_mercato, v.identikit_compratore, v.narrativa_dotazioni, v.poi_summary,
         v.comparabili_attivi, v.latitudine, v.longitudine, v.stato, v.created_at, v.slug,
         CASE WHEN z.id IS NULL THEN NULL ELSE jsonb_build_object(
           'codice_zona', z.codice_zona, 'fascia', z.fascia, 'zona', z.zona,
           'prezzo_mq_min', z.prezzo_mq_min, 'prezzo_mq_max', z.prezzo_mq_max,
           'prezzo_mq_medio', z.prezzo_mq_medio
         ) END AS zone_omi
  FROM public.valutazioni v
  LEFT JOIN public.zone_omi z ON z.id = v.zona_omi_id
  WHERE v.slug = p_slug AND v.stato = 'Completata'   -- esclude anche le bozze
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_valuation_report(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_valuation_report(text) TO anon;
```
Verificato dopo il deploy: `SELECT * FROM get_public_valuation_report('<slug reale>')` restituisce
correttamente tutti i campi (incluso `zone_omi` in jsonb); `has_function_privilege('anon', ...,
'EXECUTE')` = `true`; `pg_policies` su `valutazioni` non ha più righe con ruolo `anon`/`public`.

**Diff frontend applicato — `src/pages/ValuazioneReport.tsx` (righe 304-326), separa il percorso
agente autenticato (invariato) da quello del visitatore anonimo (ora via RPC, non più query
diretta — necessario perché la vecchia policy pubblica non esiste più):**
```diff
     supabase.auth.getSession().then(({ data: { session } }) => {
       setIsAdmin(!!session?.user);
-    });
-
-    supabase
-      .from('valutazioni')
-      .select('*, leads(nome, cognome), zone_omi(codice_zona, fascia, zona, prezzo_mq_min, prezzo_mq_max, prezzo_mq_medio)')
-      .eq('slug', slug)
-      .single()
-      .then(async ({ data, error }) => {
-        if (error || !data) { setNotFound(true); setLoading(false); return; }
-        setVal(data as ValutazioneDetail);
-
-        const { data: compData } = await supabase
-          .from('valutazione_comparabili')
-          .select('distanza_metri, transazioni_chiuse(indirizzo, prezzo_mq, prezzo_finale, mq, num_locali, data_chiusura)')
-          .eq('valutazione_id', data.id)
-          .order('distanza_metri');
-
-        setComparabili((compData ?? []) as ComparabileFetched[]);
-        setLoading(false);
-      });
+
+      const query = session?.user
+        ? supabase
+            .from('valutazioni')
+            .select('*, leads(nome, cognome), zone_omi(codice_zona, fascia, zona, prezzo_mq_min, prezzo_mq_max, prezzo_mq_medio)')
+            .eq('slug', slug)
+            .single()
+        : supabase.rpc('get_public_valuation_report', { p_slug: slug }).single();
+
+      query.then(async ({ data, error }) => {
+        if (error || !data) { setNotFound(true); setLoading(false); return; }
+        setVal(data as ValutazioneDetail);
+
+        const { data: compData } = await supabase
+          .from('valutazione_comparabili')
+          .select('distanza_metri, transazioni_chiuse(indirizzo, prezzo_mq, prezzo_finale, mq, num_locali, data_chiusura)')
+          .eq('valutazione_id', data.id)
+          .order('distanza_metri');
+
+        setComparabili((compData ?? []) as ComparabileFetched[]);
+        setLoading(false);
+      });
+    });
```
*Effetto collaterale positivo: i visitatori anonimi non vedono più nemmeno per errore una bozza
non ancora rivista dall'agente (`stato = 'Completata'` nel filtro RPC), cosa che prima era
tecnicamente possibile.*

**Verifica funzionale eseguita dopo il fix**: `npx tsc --noEmit` e `npx eslint
src/pages/ValuazioneReport.tsx` puliti; chiamata diretta alla RPC in produzione con uno slug
reale (`Completata`) restituisce correttamente tutti i campi attesi dal componente, incluso
`zone_omi` in formato jsonb identico a quello prodotto in precedenza dal join PostgREST.

**6c — Storage bucket pubblici (`immobili`, `immobili-images`) — non è un fail.**
Entrambi i bucket sono `public: true` di proposito (foto marketing degli annunci, nessun dato
personale nelle immagini stesse). Nessuna azione richiesta sul bucket in sé. Unico rischio
residuo è di processo, non di codice: un agente potrebbe caricare per errore un documento con
dati personali (es. una scansione di documento d'identità) in uno di questi bucket pubblici
invece che nel flusso Drive dedicato ai documenti. Da coprire con una nota operativa per gli
agenti, non con una modifica al codice.

### 7. Testimonianze da persone inesistenti — CAN'T TELL DAL CODICE

`ITI2.0/src/components/TestimonialsBento.tsx:47-54` mostra un badge statico **"4.9/5 — Rating
Google"** e una recensione attribuita a **"Laura B., Bergamo"**, più due case study
("Trilocale a Ranica", "Villa Indipendente") e la frase **"Più di 500 clienti hanno già scelto
di vendere casa a Bergamo senza pagare provvigioni"**. Tutto hardcoded come testo statico nel
componente, non recuperato da un'API Google/CRM reale.

Il codice non può dirti se "Laura B." è una cliente reale che ha acconsentito alla pubblicazione,
se il 4.9/5 corrisponde davvero al rating Google attuale dell'agenzia, o se "500 clienti" è un
numero verificabile. Questo è esattamente il tipo di claim coperto dalla regola FTC sulle
recensioni (ottobre 2024) se si opera anche verso utenti USA, e in ogni caso è un tema di
correttezza pubblicitaria a prescindere dalla giurisdizione.

**Cosa verificare (non è una modifica di codice, è una domanda per il Titolare):**
- Esiste consenso scritto di "Laura B." a pubblicare la citazione con nome e città?
- Il badge "4.9/5 Rating Google" riflette il rating reale e attuale del profilo Google Business
  dell'agenzia (e non un valore fissato una volta e mai aggiornato)?
- Il numero "500 clienti" è verificabile su dati reali (es. `transazioni_chiuse`)?

Se le risposte sono positive, valutare comunque un collegamento dinamico al rating Google reale
(oggi è un numero scritto a mano nel codice, quindi può disallinearsi dalla realtà nel tempo) e,
se "Laura B." o le case study sono esempi compositi/illustrativi, etichettarli come tali.

### 8-9-10 — N/A

Nessun flusso di sottoscrizione/abbonamento, nessun pagamento/free trial, nessun chatbot
conversazionale in nessuno dei due repository. Verificato tramite ricerca di dipendenze
(Stripe/billing assenti) e di componenti chat/companion (assenti). Se in futuro viene introdotto
un pagamento o un assistente conversazionale, questi tre punti vanno rivalutati da zero.

## 7. Cosa è stato già risolto automaticamente (2026-08-21)

Applicato in produzione senza bisogno di decisioni di business — puro fix tecnico di una
vulnerabilità silenziosa (RLS che esponeva dati oltre a quanto documentato/necessario):

- **§6a** — `prenotazioni_oh` non è più leggibile da `anon`/`public`. Solo `authenticated`.
  Migration: `20260821120000_fix_rls_prenotazioni_e_valutazioni_pubbliche.sql`.
- **§6b** — `valutazioni` non è più leggibile in blocco da `anon`. Sostituita con la funzione
  `get_public_valuation_report(slug)` (SECURITY DEFINER, una sola riga, solo `stato =
  'Completata'`). Migrations: `20260821120000_...sql` + `20260821121500_widen_public_valuation_report_rpc.sql`.
- **§6b frontend** — `src/pages/ValuazioneReport.tsx` aggiornato per chiamare la nuova RPC per i
  visitatori anonimi (gli agenti autenticati continuano a usare la query diretta sulla tabella,
  invariata). Senza questo passo la pagina pubblica `/report/:slug` sarebbe rimasta rotta per
  chiunque non fosse loggato, perché la vecchia policy `anon` è stata rimossa.
- Verificato post-deploy: query dirette su `pg_policies`/`has_function_privilege` in produzione,
  chiamata reale alla RPC con uno slug esistente, `tsc --noEmit` e `eslint` puliti sul file
  modificato.

Tutti gli altri punti della checklist (§3, §4, §5, §7) **richiedono una decisione del Titolare
o una revisione legale prima di poter essere applicati** — non sono stati toccati nel codice,
per non pubblicare testo legale o attivare cancellazioni automatiche senza approvazione. Sono
elencati qui sotto come compiti residui.

## 8. Cosa resta da fare — a cura del Titolare/sviluppatore (non ancora applicato)

| Cosa | Dove | Perché non è stato fatto automaticamente | Azione concreta |
|---|---|---|---|
| Aggiungere OpenAI e Google Drive/Apps Script come responsabili esterni in Privacy Policy | `ITI2.0/src/pages/Privacy.tsx` §3, §5 (diff pronti nella sezione "3. Policy non dice che si usa AI" e "4. Policy non nomina le terze parti" di questo documento) | È testo legale pubblicato: pubblicarlo senza revisione espone a un errore peggiore di quello attuale | Incollare i diff, far rivedere da un legale/DPO, poi deploy di ITI2.0 (Cloudflare) |
| Correggere "Francoforte" → "Regno Unito (adeguatezza UE)" | `ITI2.0/src/pages/Privacy.tsx` §5 | Stesso motivo: testo legale | Diff già pronto nella sezione "4. Policy non nomina le terze parti" di questo documento |
| Attivare la cancellazione/anonimizzazione automatica a 24 mesi (o correggere la policy se resterà manuale) | Nuova migration in `ITI-BO/supabase/migrations/` (scheletro pronto nella sezione "5. Dati promessi cancellati ma non cancellati") | Serve prima una decisione del Titolare su **quali `stato` contano come "non seguiti da incarico"** — il job cancella dati reali, un criterio sbagliato cancella lead attivi | Confermare i criteri, poi io posso scrivere e applicare la migration in una sessione successiva |
| Decidere se aggiungere `noindex` (o scadenza/autenticazione) alla pagina `/report/:slug` | `src/pages/ValuazioneReport.tsx` (meta Helmet, righe ~433-487) | Scelta di prodotto: oggi il `noindex` impedirebbe la condivisione social/SEO che il report usa deliberatamente (`og:title`/`og:description`) | Decidere se il trade-off condivisibilità-vs-indicizzabilità va bene così; se no, aggiungere `<meta name="robots" content="noindex, nofollow" />` è una riga sola |
| Verificare/citare Sentry come responsabile esterno | `ITI2.0/src/pages/Privacy.tsx` §5 | Testo legale (vedi sopra) | Incluso nel diff della sezione "4. Policy non nomina le terze parti" |
| Chiarire dove gira in produzione il frontend CRM (ITI-BO) | Nessun file — informazione mancante, non un bug | Non è nel repo, va chiesto a chi gestisce il dominio | Nessuna azione di codice; solo da documentare in `docs/STATO.md` una volta saputo |
| Hardening anti-spam su `OpenHouseBooking.tsx` | `ITI2.0/src/components/OpenHouseBooking.tsx` | Non blocca l'audit privacy corrente (nessun dato è esposto), è un miglioramento separato già noto | Replicare lo stesso pattern cooldown/regex già presente in `ContactForm.tsx` — posso farlo su richiesta |
| Verificare il DPA con Google per l'account Apps Script/Drive | Fuori dal codice | Dipende dal tipo di account Google usato (personale vs Workspace) | Nessuna azione di codice; verifica amministrativa |
| Verificare le testimonianze (§7 checklist) | `ITI2.0/src/components/TestimonialsBento.tsx` | Non è un bug di codice, è una domanda fattuale (consenso, dati reali) | Nessuna azione di codice; rispondere alle 3 domande in §6, poi eventualmente aggiornare i testi o collegare un dato reale |

## 9. Ordine di intervento consigliato per i punti residui

1. **§3 e §4 (policy incompleta su AI e terze parti)** — è il documento che un regolatore legge
   per primo; oggi non corrisponde al codice. Diff pronti, serve solo revisione legale.
2. **§5 (retention non automatizzata)** — una promessa scritta e non mantenuta aggrava qualunque
   incidente futuro. Richiede prima una decisione del Titolare sui criteri esatti, poi il job.
3. **§7 (testimonianze)** — verifica di fatto da fare con il Titolare, non richiede codice.
4. **`noindex` sul report pubblico** — decisione di prodotto, basso rischio, un solo attributo.
5. **§1, §2, §8, §9, §10 della checklist originale** — nessuna azione.
