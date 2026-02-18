"use client";

import React, { useEffect, useState } from 'react';
import { 
  SheetContent, SheetHeader, SheetTitle, SheetDescription 
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Mail, Phone, User, Copy, Check } from "lucide-react";
import { showSuccess } from "@/utils/toast";

interface AttendeesSheetProps {
  openHouseId: string;
  propertyTitle: string;
}

const AttendeesSheet = ({ openHouseId, propertyTitle }: AttendeesSheetProps) => {
  const [attendees, setAttendees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchAttendees = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('prenotazioni_oh')
        .select('*')
        .eq('open_house_id', openHouseId)
        .order('created_at', { ascending: true });
      
      if (!error) setAttendees(data || []);
      setLoading(false);
    };

    if (openHouseId) fetchAttendees();
  }, [openHouseId]);

  const copyEmails = () => {
    const emails = attendees.map(a => a.email).join(', ');
    navigator.clipboard.writeText(emails);
    setCopied(true);
    showSuccess("Email copiate negli appunti");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SheetContent className="w-full sm:max-w-md border-none shadow-2xl">
      <SheetHeader className="pb-6 border-b">
        <SheetTitle className="text-2xl font-bold">Iscritti all'Evento</SheetTitle>
        <SheetDescription>{propertyTitle}</SheetDescription>
      </SheetHeader>

      <div className="py-6 space-y-6 overflow-y-auto max-h-[calc(100vh-200px)]">
        {loading ? (
          <div className="text-center py-12 text-gray-400 font-medium">Caricamento iscritti...</div>
        ) : attendees.length === 0 ? (
          <div className="text-center py-12 text-gray-400 italic">Nessuna prenotazione ricevuta.</div>
        ) : (
          <>
            <div className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl">
              <span className="text-sm font-bold text-gray-500 uppercase">Totale: {attendees.length}</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={copyEmails}
                className="text-[#94b0ab] hover:text-[#7a948f] hover:bg-[#94b0ab]/5 font-bold gap-2"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                Copia Email
              </Button>
            </div>
            
            <div className="space-y-4">
              {attendees.map((att) => (
                <div key={att.id} className="p-4 rounded-2xl border border-gray-100 hover:border-[#94b0ab]/30 transition-all group">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-[#94b0ab]/10 text-[#94b0ab] flex items-center justify-center font-bold">
                      {att.nome.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 leading-tight">{att.nome}</p>
                      <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Orario: {att.orario_scelto?.slice(0, 5) || 'N/D'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Mail size={14} className="text-gray-300" /> {att.email}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Phone size={14} className="text-gray-300" /> {att.telefono || 'Non specificato'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </SheetContent>
  );
};

export default AttendeesSheet;