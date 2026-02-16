"use client";

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { 
  ChevronLeft, MapPin, Maximize2, Home, BedDouble, 
  Bath, Check, Info, Phone, Calendar, ArrowUpRight,
  ExternalLink, MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';

const PropertyDetail = () => {
  const { slug } = useParams();
  const [property, setProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    const fetchProperty = async () => {
      const { data, error } = await supabase
        .from('immobili')
        .select('*')
        .eq('slug', slug)
        .single();
      
      if (error) showError("Immobile non trovato");
      else setProperty(data);
      setLoading(false);
    };
    fetchProperty();
  }, [slug]);

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-[#94b0ab]">Caricamento...</div>;
  if (!property) return <div className="min-h-screen flex items-center justify-center">Immobile non trovato</div>;

  const encodedAddress = encodeURIComponent(`${property.indirizzo || ''}, ${property.zona || ''}, ${property.citta || ''}`);
  const mapUrl = `https://maps.google.com/maps?q=${encodedAddress}&t=&z=15&ie=UTF8&iwloc=&output=embed`;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(price);
  };

  return (
    <div className="bg-[#fcfcfc] min-h-screen pb-24 lg:pb-0">
      {/* Navigation Header */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2 text-gray-500 hover:text-[#94b0ab] transition-colors font-bold group">
            <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
            Torna alla lista
          </Link>
          <div className="hidden md:block font-bold text-gray-900 truncate max-w-[300px]">
            {property.titolo}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* LEFT CONTENT (Gallery + Info) */}
          <div className="lg:col-span-8 space-y-10">
            {/* Gallery Section */}
            <div className="space-y-4">
              <div className="relative aspect-[16/9] rounded-[2.5rem] overflow-hidden shadow-2xl bg-gray-100 group">
                <img 
                  src={property.immagini_urls?.[activeImage] || property.copertina_url} 
                  alt={property.titolo}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute top-6 left-6 flex gap-2">
                  <Badge className="bg-white/90 backdrop-blur-md text-[#1a1a1a] border-none px-4 py-1.5 rounded-full font-bold shadow-sm">
                    {property.stato}
                  </Badge>
                  {property.in_evidenza && (
                    <Badge className="bg-[#94b0ab] text-white border-none px-4 py-1.5 rounded-full font-bold shadow-sm">
                      Top Choice
                    </Badge>
                  )}
                </div>
              </div>
              
              {property.immagini_urls && property.immagini_urls.length > 1 && (
                <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                  {property.immagini_urls.map((url: string, idx: number) => (
                    <button 
                      key={idx}
                      onClick={() => setActiveImage(idx)}
                      className={cn(
                        "relative w-24 h-16 rounded-xl overflow-hidden flex-shrink-0 border-2 transition-all",
                        activeImage === idx ? "border-[#94b0ab] scale-105 shadow-md" : "border-transparent opacity-60 hover:opacity-100"
                      )}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Title & Stats */}
            <div className="space-y-6">
              <div className="space-y-2">
                <h1 className="text-4xl font-extrabold text-gray-900 leading-tight">{property.titolo}</h1>
                <div className="flex items-center gap-2 text-gray-500 font-medium">
                  <MapPin size={18} className="text-[#94b0ab]" />
                  {property.indirizzo}, {property.zona}, {property.citta}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { icon: Maximize2, label: 'Superficie', value: `${property.mq} mq` },
                  { icon: Home, label: 'Tipologia', value: property.locali },
                  { icon: Bath, label: 'Bagni', value: property.bagni },
                  { icon: Info, label: 'Piano', value: property.piano || 'N/D' }
                ].map((stat, i) => (
                  <div key={i} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-1">
                    <stat.icon size={20} className="text-[#94b0ab] mb-1" />
                    <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">{stat.label}</span>
                    <span className="font-bold text-gray-900">{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-gray-900">Descrizione</h2>
              <div className="prose prose-gray max-w-none text-gray-600 leading-relaxed bg-white p-8 rounded-[2rem] border border-gray-100">
                {property.descrizione}
              </div>
            </div>

            {/* Real Google Maps Integration */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-gray-900">Posizione</h2>
              <div className="h-[400px] rounded-[2.5rem] overflow-hidden border border-gray-100 shadow-lg grayscale-[0.3] hover:grayscale-0 transition-all">
                <iframe
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  style={{ border: 0 }}
                  src={mapUrl}
                  allowFullScreen
                ></iframe>
              </div>
            </div>
          </div>

          {/* RIGHT SIDEBAR (Sticky Form) */}
          <div className="lg:col-span-4">
            <div className="sticky top-28 space-y-6">
              <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden">
                <div className="p-8 space-y-6">
                  <div className="flex justify-between items-baseline border-b border-gray-50 pb-6">
                    <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Prezzo Richiesto</span>
                    <span className="text-3xl font-black text-[#1a1a1a]">{formatPrice(property.prezzo)}</span>
                  </div>

                  {/* Contact Form (Compact) */}
                  <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); showSuccess("Messaggio inviato!"); }}>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-1">Nome Completo</label>
                      <Input placeholder="Es: Mario Rossi" className="rounded-xl h-11 border-gray-100" required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-1">Email o Telefono</label>
                      <Input placeholder="La tua email..." className="rounded-xl h-11 border-gray-100" required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-1">Il tuo messaggio</label>
                      <Textarea placeholder="Sono interessato a questo immobile..." rows={3} className="rounded-xl border-gray-100 resize-none" required />
                    </div>
                    
                    <Button className="w-full bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl h-14 font-bold shadow-lg shadow-[#94b0ab]/20 transition-all active:scale-95 mt-2">
                      Prenota una Visita
                    </Button>
                  </form>

                  {/* Immobiliare.it Integration */}
                  {property.link_immobiliare && (
                    <div className="pt-2">
                      <Button 
                        variant="outline"
                        onClick={() => window.open(property.link_immobiliare, '_blank')}
                        className="w-full h-12 rounded-xl border-gray-200 text-gray-500 font-bold hover:bg-gray-50 group"
                      >
                        Vedi su Immobiliare.it
                        <ExternalLink size={16} className="ml-2 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* MOBILE BOTTOM BAR */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 lg:hidden z-50 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex-1">
            {property.link_immobiliare ? (
              <Button 
                variant="outline" 
                size="lg"
                onClick={() => window.open(property.link_immobiliare, '_blank')}
                className="w-full rounded-2xl border-gray-200 font-bold h-14 text-gray-700 bg-white"
              >
                <img src="https://static.immobiliare.it/favicon.ico" alt="" className="w-5 h-5 mr-2" />
                Dettagli
              </Button>
            ) : (
              <div className="pl-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">Prezzo</p>
                <p className="text-xl font-black text-[#1a1a1a]">{formatPrice(property.prezzo)}</p>
              </div>
            )}
          </div>
          <Button className="flex-[1.5] bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl h-14 font-bold shadow-xl shadow-[#94b0ab]/20">
            Prenota Visita
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PropertyDetail;