/**
 * Cookie so skrytým „Najbližším termínom“ na karte Dnes (id termínu) — číta ho server
 * (app/portal/page.tsx), zapisuje × v AppointmentNotice. Samostatný súbor: konštanta
 * exportovaná zo súboru s "use client" je na serveri len odkaz na klientsky modul, nie text.
 */
export const HIDDEN_APPOINTMENT_COOKIE = "fp_appt_hidden";
