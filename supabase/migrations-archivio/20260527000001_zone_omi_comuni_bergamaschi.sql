-- Import zone OMI per i principali comuni della provincia di Bergamo.
-- Prezzi residenziali indicativi (€/mq, abitazioni civili) basati su dati OMI
-- Agenzia delle Entrate. Valori da verificare e aggiornare ogni semestre su:
-- https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricati-e-terreni/omi/banche-dati/quotazioni-immobiliari
--
-- Comuni già presenti nel DB al momento dell'import (esclusi):
-- Alzano Lombardo, Bergamo, Gorle, Orio al Serio, Ponteranica, Ranica,
-- Seriate, Torre Boldone, Villa di Serio.

INSERT INTO public.zone_omi
  (codice_zona, comune, provincia, fascia, zona, prezzo_mq_min, prezzo_mq_max, geom, updated_at)
VALUES

  -- ── HINTERLAND OVEST / NORD-OVEST ─────────────────────────────────────────
  ('BG-DAL-B1', 'Dalmine',            'BG', 'B', 'Zona residenziale del comune di Dalmine',              950, 1600, ST_SetSRID(ST_MakePoint(9.5994, 45.6505), 4326), now()),
  ('BG-STZ-B1', 'Stezzano',           'BG', 'B', 'Zona residenziale del comune di Stezzano',            1050, 1700, ST_SetSRID(ST_MakePoint(9.6508, 45.6528), 4326), now()),
  ('BG-LAL-B1', 'Lallio',             'BG', 'B', 'Zona residenziale del comune di Lallio',              1100, 1800, ST_SetSRID(ST_MakePoint(9.6736, 45.6428), 4326), now()),
  ('BG-CUR-B1', 'Curno',              'BG', 'B', 'Zona residenziale del comune di Curno',               1150, 1900, ST_SetSRID(ST_MakePoint(9.6147, 45.6753), 4326), now()),
  ('BG-MOZ-B1', 'Mozzo',              'BG', 'B', 'Zona residenziale del comune di Mozzo',               1200, 2000, ST_SetSRID(ST_MakePoint(9.6397, 45.7044), 4326), now()),
  ('BG-AZZ-B1', 'Azzano San Paolo',   'BG', 'B', 'Zona residenziale del comune di Azzano San Paolo',   1000, 1700, ST_SetSRID(ST_MakePoint(9.6231, 45.6419), 4326), now()),
  ('BG-OSS-B1', 'Osio Sotto',         'BG', 'B', 'Zona residenziale del comune di Osio Sotto',           950, 1550, ST_SetSRID(ST_MakePoint(9.6011, 45.6247), 4326), now()),
  ('BG-OSP-B1', 'Osio Sopra',         'BG', 'B', 'Zona residenziale del comune di Osio Sopra',           950, 1550, ST_SetSRID(ST_MakePoint(9.5978, 45.6425), 4326), now()),
  ('BG-VDL-B1', 'Verdellino',         'BG', 'B', 'Zona residenziale del comune di Verdellino',           900, 1450, ST_SetSRID(ST_MakePoint(9.5753, 45.6392), 4326), now()),
  ('BG-VRD-B1', 'Verdello',           'BG', 'B', 'Zona residenziale del comune di Verdello',             950, 1500, ST_SetSRID(ST_MakePoint(9.5850, 45.6261), 4326), now()),
  ('BG-ZAN-B1', 'Zanica',             'BG', 'B', 'Zona residenziale del comune di Zanica',              1050, 1700, ST_SetSRID(ST_MakePoint(9.6469, 45.6306), 4326), now()),
  ('BG-GRS-B1', 'Grassobbio',         'BG', 'B', 'Zona residenziale del comune di Grassobbio',          1000, 1650, ST_SetSRID(ST_MakePoint(9.6711, 45.6500), 4326), now()),
  ('BG-SPI-B1', 'Spirano',            'BG', 'B', 'Zona residenziale del comune di Spirano',               950, 1550, ST_SetSRID(ST_MakePoint(9.6231, 45.6244), 4326), now()),
  ('BG-LEV-B1', 'Levate',             'BG', 'B', 'Zona residenziale del comune di Levate',                950, 1600, ST_SetSRID(ST_MakePoint(9.5919, 45.6406), 4326), now()),
  ('BG-BLT-B1', 'Boltiere',           'BG', 'B', 'Zona residenziale del comune di Boltiere',              900, 1500, ST_SetSRID(ST_MakePoint(9.5378, 45.6394), 4326), now()),
  ('BG-URG-B1', 'Urgnano',            'BG', 'B', 'Zona residenziale del comune di Urgnano',               900, 1500, ST_SetSRID(ST_MakePoint(9.6125, 45.5978), 4326), now()),

  -- ── HINTERLAND SUD ────────────────────────────────────────────────────────
  ('BG-BRU-B1', 'Brusaporto',         'BG', 'B', 'Zona residenziale del comune di Brusaporto',          1050, 1700, ST_SetSRID(ST_MakePoint(9.7236, 45.6656), 4326), now()),
  ('BG-CMZ-B1', 'Costa di Mezzate',   'BG', 'B', 'Zona residenziale del comune di Costa di Mezzate',     950, 1600, ST_SetSRID(ST_MakePoint(9.7364, 45.6594), 4326), now()),
  ('BG-BAG-B1', 'Bagnatica',          'BG', 'B', 'Zona residenziale del comune di Bagnatica',             950, 1550, ST_SetSRID(ST_MakePoint(9.7117, 45.6622), 4326), now()),
  ('BG-SCA-B1', 'Scanzorosciate',     'BG', 'B', 'Zona residenziale del comune di Scanzorosciate',      1050, 1750, ST_SetSRID(ST_MakePoint(9.7483, 45.6886), 4326), now()),
  ('BG-PED-B1', 'Pedrengo',           'BG', 'B', 'Zona residenziale del comune di Pedrengo',            1100, 1800, ST_SetSRID(ST_MakePoint(9.7281, 45.6878), 4326), now()),
  ('BG-TDR-B1', 'Torre de'' Roveri',  'BG', 'B', 'Zona residenziale del comune di Torre de'' Roveri',    950, 1600, ST_SetSRID(ST_MakePoint(9.7592, 45.6772), 4326), now()),
  ('BG-CHD-B1', 'Chiuduno',           'BG', 'B', 'Zona residenziale del comune di Chiuduno',              900, 1500, ST_SetSRID(ST_MakePoint(9.7431, 45.6525), 4326), now()),
  ('BG-GDM-B1', 'Grumello del Monte', 'BG', 'B', 'Zona residenziale del comune di Grumello del Monte',    950, 1600, ST_SetSRID(ST_MakePoint(9.7461, 45.6386), 4326), now()),
  ('BG-TEL-B1', 'Telgate',            'BG', 'B', 'Zona residenziale del comune di Telgate',               900, 1500, ST_SetSRID(ST_MakePoint(9.7506, 45.6278), 4326), now()),
  ('BG-CCL-B1', 'Castelli Calepio',   'BG', 'B', 'Zona residenziale del comune di Castelli Calepio',      900, 1500, ST_SetSRID(ST_MakePoint(9.7528, 45.6181), 4326), now()),
  ('BG-CAF-B1', 'Carobbio degli Angeli','BG','B','Zona residenziale del comune di Carobbio degli Angeli',  950, 1600, ST_SetSRID(ST_MakePoint(9.7650, 45.6833), 4326), now()),

  -- ── VALLE SERIANA ─────────────────────────────────────────────────────────
  ('BG-NEM-B1', 'Nembro',             'BG', 'B', 'Zona residenziale del comune di Nembro',               850, 1400, ST_SetSRID(ST_MakePoint(9.7553, 45.7367), 4326), now()),
  ('BG-ALB-B1', 'Albino',             'BG', 'B', 'Zona residenziale del comune di Albino',               800, 1300, ST_SetSRID(ST_MakePoint(9.8025, 45.7656), 4326), now()),
  ('BG-GAZ-B1', 'Gazzaniga',          'BG', 'B', 'Zona residenziale del comune di Gazzaniga',            750, 1250, ST_SetSRID(ST_MakePoint(9.8300, 45.7847), 4326), now()),
  ('BG-GND-B1', 'Gandino',            'BG', 'B', 'Zona residenziale del comune di Gandino',              700, 1200, ST_SetSRID(ST_MakePoint(9.8544, 45.8133), 4326), now()),
  ('BG-CSN-B1', 'Casnigo',            'BG', 'B', 'Zona residenziale del comune di Casnigo',              700, 1150, ST_SetSRID(ST_MakePoint(9.8397, 45.7942), 4326), now()),
  ('BG-VTV-B1', 'Vertova',            'BG', 'B', 'Zona residenziale del comune di Vertova',              700, 1150, ST_SetSRID(ST_MakePoint(9.8197, 45.7792), 4326), now()),
  ('BG-FIO-B1', 'Fiorano al Serio',   'BG', 'B', 'Zona residenziale del comune di Fiorano al Serio',    750, 1200, ST_SetSRID(ST_MakePoint(9.8194, 45.7678), 4326), now()),
  ('BG-CEN-B1', 'Cene',               'BG', 'B', 'Zona residenziale del comune di Cene',                800, 1300, ST_SetSRID(ST_MakePoint(9.7836, 45.7564), 4326), now()),
  ('BG-CLU-B1', 'Clusone',            'BG', 'B', 'Zona residenziale del comune di Clusone',             650, 1100, ST_SetSRID(ST_MakePoint(9.9533, 45.8894), 4326), now()),
  ('BG-GRO-B1', 'Gromo',              'BG', 'B', 'Zona residenziale del comune di Gromo',               550,  950, ST_SetSRID(ST_MakePoint(9.9433, 45.9256), 4326), now()),
  ('BG-ART-B1', 'Ardesio',            'BG', 'B', 'Zona residenziale del comune di Ardesio',             600, 1050, ST_SetSRID(ST_MakePoint(9.9619, 45.9422), 4326), now()),
  ('BG-CER-B1', 'Cerete',             'BG', 'B', 'Zona residenziale del comune di Cerete',              700, 1150, ST_SetSRID(ST_MakePoint(9.9717, 45.8708), 4326), now()),

  -- ── VALLE BREMBANA / NORD ─────────────────────────────────────────────────
  ('BG-SRS-B1', 'Sorisole',           'BG', 'B', 'Zona residenziale del comune di Sorisole',           1150, 1900, ST_SetSRID(ST_MakePoint(9.6794, 45.7408), 4326), now()),
  ('BG-PLD-B1', 'Paladina',           'BG', 'B', 'Zona residenziale del comune di Paladina',           1050, 1750, ST_SetSRID(ST_MakePoint(9.6889, 45.7547), 4326), now()),
  ('BG-ALM-B1', 'Almé',               'BG', 'B', 'Zona residenziale del comune di Almé',               1100, 1800, ST_SetSRID(ST_MakePoint(9.6678, 45.7597), 4326), now()),
  ('BG-BDS-B1', 'Brembate di Sopra',  'BG', 'B', 'Zona residenziale del comune di Brembate di Sopra',   950, 1600, ST_SetSRID(ST_MakePoint(9.6181, 45.7658), 4326), now()),
  ('BG-ZGN-B1', 'Zogno',              'BG', 'B', 'Zona residenziale del comune di Zogno',               800, 1350, ST_SetSRID(ST_MakePoint(9.6608, 45.7944), 4326), now()),
  ('BG-SPT-B1', 'San Pellegrino Terme','BG','B', 'Zona residenziale del comune di San Pellegrino Terme', 850, 1450, ST_SetSRID(ST_MakePoint(9.7944, 45.8386), 4326), now()),
  ('BG-SDR-B1', 'Sedrina',            'BG', 'B', 'Zona residenziale del comune di Sedrina',             800, 1300, ST_SetSRID(ST_MakePoint(9.6397, 45.7844), 4326), now()),
  ('BG-AMB-B1', 'Ambivere',           'BG', 'B', 'Zona residenziale del comune di Ambivere',            850, 1400, ST_SetSRID(ST_MakePoint(9.5964, 45.7356), 4326), now()),
  ('BG-MAP-B1', 'Mapello',            'BG', 'B', 'Zona residenziale del comune di Mapello',              900, 1500, ST_SetSRID(ST_MakePoint(9.5742, 45.7264), 4326), now()),
  ('BG-CPR-B1', 'Caprino Bergamasco', 'BG', 'B', 'Zona residenziale del comune di Caprino Bergamasco',  800, 1350, ST_SetSRID(ST_MakePoint(9.5356, 45.7469), 4326), now()),
  ('BG-CSB-B1', 'Cisano Bergamasco',  'BG', 'B', 'Zona residenziale del comune di Cisano Bergamasco',   850, 1400, ST_SetSRID(ST_MakePoint(9.5044, 45.7022), 4326), now()),
  ('BG-PTD-B1', 'Pontida',            'BG', 'B', 'Zona residenziale del comune di Pontida',              850, 1400, ST_SetSRID(ST_MakePoint(9.5606, 45.7131), 4326), now()),
  ('BG-SGB-B1', 'San Giovanni Bianco','BG', 'B', 'Zona residenziale del comune di San Giovanni Bianco',  700, 1200, ST_SetSRID(ST_MakePoint(9.7681, 45.8756), 4326), now()),
  ('BG-PBR-B1', 'Piazza Brembana',    'BG', 'B', 'Zona residenziale del comune di Piazza Brembana',     650, 1150, ST_SetSRID(ST_MakePoint(9.7175, 45.9472), 4326), now()),
  ('BG-LEN-B1', 'Lenna',              'BG', 'B', 'Zona residenziale del comune di Lenna',                600, 1050, ST_SetSRID(ST_MakePoint(9.7308, 45.9247), 4326), now()),

  -- ── ISOLA BERGAMASCA ──────────────────────────────────────────────────────
  ('BG-BRE-B1', 'Brembate',           'BG', 'B', 'Zona residenziale del comune di Brembate',             900, 1500, ST_SetSRID(ST_MakePoint(9.5425, 45.6181), 4326), now()),
  ('BG-CSG-B1', 'Capriate San Gervasio','BG','B','Zona residenziale del comune di Capriate San Gervasio', 900, 1500, ST_SetSRID(ST_MakePoint(9.5217, 45.6092), 4326), now()),
  ('BG-CLD-B1', 'Calusco d''Adda',    'BG', 'B', 'Zona residenziale del comune di Calusco d''Adda',      900, 1500, ST_SetSRID(ST_MakePoint(9.4889, 45.6422), 4326), now()),
  ('BG-FLG-B1', 'Filago',             'BG', 'B', 'Zona residenziale del comune di Filago',               950, 1550, ST_SetSRID(ST_MakePoint(9.5578, 45.6381), 4326), now()),
  ('BG-MDN-B1', 'Madone',             'BG', 'B', 'Zona residenziale del comune di Madone',               950, 1600, ST_SetSRID(ST_MakePoint(9.5481, 45.6694), 4326), now()),
  ('BG-CSR-B1', 'Ciserano',           'BG', 'B', 'Zona residenziale del comune di Ciserano',             900, 1500, ST_SetSRID(ST_MakePoint(9.5656, 45.6078), 4326), now()),
  ('BG-GHI-B1', 'Ghisalba',           'BG', 'B', 'Zona residenziale del comune di Ghisalba',             850, 1400, ST_SetSRID(ST_MakePoint(9.6394, 45.5756), 4326), now()),
  ('BG-PRV-B1', 'Presezzo',           'BG', 'B', 'Zona residenziale del comune di Presezzo',            1000, 1650, ST_SetSRID(ST_MakePoint(9.5808, 45.6972), 4326), now()),

  -- ── VALLE CAVALLINA ───────────────────────────────────────────────────────
  ('BG-TRB-B1', 'Trescore Balneario', 'BG', 'B', 'Zona residenziale del comune di Trescore Balneario',   900, 1550, ST_SetSRID(ST_MakePoint(9.8439, 45.6953), 4326), now()),
  ('BG-CSZ-B1', 'Casazza',            'BG', 'B', 'Zona residenziale del comune di Casazza',               750, 1300, ST_SetSRID(ST_MakePoint(9.8650, 45.7400), 4326), now()),
  ('BG-ENT-B1', 'Entratico',          'BG', 'B', 'Zona residenziale del comune di Entratico',             750, 1250, ST_SetSRID(ST_MakePoint(9.8281, 45.7133), 4326), now()),
  ('BG-END-B1', 'Endine Gaiano',      'BG', 'B', 'Zona residenziale del comune di Endine Gaiano',        700, 1200, ST_SetSRID(ST_MakePoint(9.9214, 45.7872), 4326), now()),
  ('BG-REB-B1', 'Ranzanico',          'BG', 'B', 'Zona residenziale del comune di Ranzanico',             650, 1150, ST_SetSRID(ST_MakePoint(9.9042, 45.7722), 4326), now()),

  -- ── BASSA BERGAMASCA EST ──────────────────────────────────────────────────
  ('BG-CLS-B1', 'Cologno al Serio',   'BG', 'B', 'Zona residenziale del comune di Cologno al Serio',     900, 1500, ST_SetSRID(ST_MakePoint(9.7083, 45.5953), 4326), now()),
  ('BG-ROM-B1', 'Romano di Lombardia','BG', 'B', 'Zona residenziale del comune di Romano di Lombardia',   900, 1500, ST_SetSRID(ST_MakePoint(9.7481, 45.5211), 4326), now()),
  ('BG-MRN-B1', 'Mornico al Serio',   'BG', 'B', 'Zona residenziale del comune di Mornico al Serio',     800, 1300, ST_SetSRID(ST_MakePoint(9.7108, 45.5594), 4326), now()),
  ('BG-MRT-B1', 'Martinengo',         'BG', 'B', 'Zona residenziale del comune di Martinengo',            850, 1400, ST_SetSRID(ST_MakePoint(9.7736, 45.5689), 4326), now()),
  ('BG-FNT-B1', 'Fontanella',         'BG', 'B', 'Zona residenziale del comune di Fontanella',            800, 1300, ST_SetSRID(ST_MakePoint(9.7631, 45.5469), 4326), now()),
  ('BG-COV-B1', 'Covo',               'BG', 'B', 'Zona residenziale del comune di Covo',                  750, 1300, ST_SetSRID(ST_MakePoint(9.7636, 45.4878), 4326), now()),
  ('BG-ISS-B1', 'Isso',               'BG', 'B', 'Zona residenziale del comune di Isso',                  750, 1250, ST_SetSRID(ST_MakePoint(9.7825, 45.5031), 4326), now()),

  -- ── TREVIGLIESE / BASSA BERGAMASCA OVEST ─────────────────────────────────
  ('BG-TRV-B1', 'Treviglio',          'BG', 'B', 'Zona residenziale del comune di Treviglio',            1050, 1800, ST_SetSRID(ST_MakePoint(9.5908, 45.5219), 4326), now()),
  ('BG-CVG-B1', 'Caravaggio',         'BG', 'B', 'Zona residenziale del comune di Caravaggio',            850, 1450, ST_SetSRID(ST_MakePoint(9.6422, 45.4967), 4326), now()),
  ('BG-CLV-B1', 'Calvenzano',         'BG', 'B', 'Zona residenziale del comune di Calvenzano',            800, 1350, ST_SetSRID(ST_MakePoint(9.6208, 45.5042), 4326), now()),
  ('BG-BRN-B1', 'Brignano Gera d''Adda','BG','B','Zona residenziale del comune di Brignano Gera d''Adda', 800, 1350, ST_SetSRID(ST_MakePoint(9.6542, 45.5431), 4326), now()),
  ('BG-MZN-B1', 'Mozzanica',          'BG', 'B', 'Zona residenziale del comune di Mozzanica',             800, 1300, ST_SetSRID(ST_MakePoint(9.6736, 45.4778), 4326), now()),
  ('BG-FAR-B1', 'Fara Gera d''Adda',  'BG', 'B', 'Zona residenziale del comune di Fara Gera d''Adda',    850, 1400, ST_SetSRID(ST_MakePoint(9.5369, 45.5528), 4326), now()),
  ('BG-CNA-B1', 'Canonica d''Adda',   'BG', 'B', 'Zona residenziale del comune di Canonica d''Adda',     900, 1500, ST_SetSRID(ST_MakePoint(9.5158, 45.5839), 4326), now()),
  ('BG-PNV-B1', 'Pontirolo Nuovo',    'BG', 'B', 'Zona residenziale del comune di Pontirolo Nuovo',       850, 1400, ST_SetSRID(ST_MakePoint(9.5628, 45.5703), 4326), now()),
  ('BG-LUR-B1', 'Lurano',             'BG', 'B', 'Zona residenziale del comune di Lurano',                900, 1500, ST_SetSRID(ST_MakePoint(9.5847, 45.5972), 4326), now()),

  -- ── LAGO D'ISEO / SEBINO BERGAMASCO ──────────────────────────────────────
  ('BG-SAR-B1', 'Sarnico',            'BG', 'B', 'Zona residenziale del comune di Sarnico',              1100, 1900, ST_SetSRID(ST_MakePoint(9.9633, 45.6792), 4326), now()),
  ('BG-PRT-B1', 'Paratico',           'BG', 'B', 'Zona residenziale del comune di Paratico',              950, 1700, ST_SetSRID(ST_MakePoint(9.9486, 45.6708), 4326), now()),
  ('BG-PRD-B1', 'Predore',            'BG', 'B', 'Zona residenziale del comune di Predore',             1000, 1750, ST_SetSRID(ST_MakePoint(9.9908, 45.7053), 4326), now()),
  ('BG-TAV-B1', 'Tavernola Bergamasca','BG','B', 'Zona residenziale del comune di Tavernola Bergamasca',  900, 1600, ST_SetSRID(ST_MakePoint(10.0208, 45.7208), 4326), now()),
  ('BG-LOV-B1', 'Lovere',             'BG', 'B', 'Zona residenziale del comune di Lovere',                750, 1250, ST_SetSRID(ST_MakePoint(10.0717, 45.8136), 4326), now()),
  ('BG-CVL-B1', 'Costa Volpino',      'BG', 'B', 'Zona residenziale del comune di Costa Volpino',         700, 1200, ST_SetSRID(ST_MakePoint(10.0914, 45.8283), 4326), now());

-- Fix post-insert: correzione due righe errate del batch originale
-- (eseguito separatamente con UPDATE diretto sugli UUID)
