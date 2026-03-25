import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-4 border-none shadow-lg rounded-2xl", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4 w-full px-1",
        month_caption: "flex justify-between items-center w-full pt-1 mb-4",
        caption_label: "text-lg font-bold text-gray-900 ml-2",
        nav: "flex items-center gap-1",
        button_previous: "h-8 w-8 bg-gray-50 hover:bg-gray-100 rounded-full flex items-center justify-center text-gray-600 transition-colors p-0",
        button_next: "h-8 w-8 bg-gray-50 hover:bg-gray-100 rounded-full flex items-center justify-center text-gray-600 transition-colors p-0",
        month_grid: "w-full border-collapse",
        weekdays: "flex justify-between w-full mb-3 px-1",
        weekday: "text-gray-400 font-bold text-[0.7rem] uppercase w-9 text-center tracking-wider",
        week: "flex justify-between w-full mt-1 px-1",
        day: "relative p-0 text-center focus-within:relative focus-within:z-20",
        day_button: "h-9 w-9 p-0 font-medium rounded-full text-gray-700 hover:bg-gray-100 transition-all",
        range_end: "day-range-end",
        selected: "bg-[#94b0ab] text-white hover:bg-[#7a948f] hover:text-white font-bold shadow-md shadow-[#94b0ab]/30 rounded-full",
        today: "text-[#94b0ab] font-bold bg-[#94b0ab]/10 rounded-full",
        outside: "text-gray-300 opacity-50",
        disabled: "text-muted-foreground opacity-50",
        range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
