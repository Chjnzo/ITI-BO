import { z } from 'zod';

export const PropertySchema = z.object({
  titolo: z.string().min(3, 'Min 3 caratteri').max(200),
  prezzo: z.number().positive('Deve essere positivo').optional(),
  mq: z.number().positive('MQ deve essere positivo'),
  locali: z.string().min(1),
  citta: z.string().min(2),
  indirizzo: z.string().min(3),
  piano: z.string().optional(),
  bagni: z.number().int().min(1).max(10),
  classe_energetica: z.enum(['A1', 'A2', 'B', 'C', 'D', 'E', 'F', 'G']),
  stato_immobile: z.string(),
  spese_condominiali: z.number().nonnegative().optional(),
  anno_costruzione: z.number().int().min(1800).max(new Date().getFullYear()),
  caratteristiche: z.array(z.string()),
  descrizione: z.string().max(5000).optional(),
  stato: z.enum(['Disponibile', 'Venduto', 'Ritirato']),
  link_immobiliare: z.string().url().optional().or(z.literal('')),
  proprietario: z.string().optional(),
});

export const LeadSchema = z.object({
  nome: z.string().min(2).max(100),
  cognome: z.string().min(2).max(100),
  email: z.string().email('Email non valida'),
  telefono: z.string().regex(/^\+?[\d\s\-()]+$/, 'Telefono non valido'),
  budget: z.number().positive().optional(),
  tipo_cliente: z.enum(['Acquirente', 'Venditore', 'Ibrido']),
  stato: z.enum(['Nuovo', 'Contattato', 'Trattativa', 'Chiuso', 'Perso']),
});

export const TaskSchema = z.object({
  tipologia: z.enum(['Chiamata', 'WhatsApp', 'Appuntamento']),
  stato: z.enum(['Da fare', 'In corso', 'Completata']),
  data: z.string().date(),
  ora: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  nota: z.string().max(1000).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Min 6 caratteri'),
});

export type PropertyFormData = z.infer<typeof PropertySchema>;
export type LeadFormData = z.infer<typeof LeadSchema>;
export type TaskFormData = z.infer<typeof TaskSchema>;
