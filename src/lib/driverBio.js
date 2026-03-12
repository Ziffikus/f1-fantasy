// Statische Fahrer-Biografie-Daten (Nationalität, Geburtstag, WM-Titel)
export const DRIVER_BIO = {
  'NOR': { nationality: '🇬🇧 Britisch',    born: '1999-11-13', championships: 0, hometown: 'Exeter' },
  'PIA': { nationality: '🇦🇺 Australisch', born: '2001-04-06', championships: 0, hometown: 'Melbourne' },
  'RUS': { nationality: '🇬🇧 Britisch',    born: '1998-02-15', championships: 0, hometown: 'King\'s Lynn' },
  'ANT': { nationality: '🇮🇹 Italienisch', born: '2006-08-25', championships: 0, hometown: 'Bologna' },
  'VER': { nationality: '🇳🇱 Niederländisch', born: '1997-09-30', championships: 4, hometown: 'Hasselt' },
  'HAD': { nationality: '🇫🇷 Französisch', born: '2004-09-28', championships: 0, hometown: 'Paris' },
  'LEC': { nationality: '🇲🇨 Monegassisch', born: '1997-10-16', championships: 0, hometown: 'Monaco' },
  'HAM': { nationality: '🇬🇧 Britisch',    born: '1985-01-07', championships: 7, hometown: 'Stevenage' },
  'ALB': { nationality: '🇹🇭 Thailändisch', born: '1996-03-23', championships: 0, hometown: 'London' },
  'SAI': { nationality: '🇪🇸 Spanisch',    born: '1994-09-01', championships: 0, hometown: 'Madrid' },
  'LAW': { nationality: '🇳🇿 Neuseeländisch', born: '2002-04-11', championships: 0, hometown: 'Pukekohe' },
  'LIN': { nationality: '🇸🇪 Schwedisch',  born: '2006-07-03', championships: 0, hometown: 'Stockholm' },
  'ALO': { nationality: '🇪🇸 Spanisch',    born: '1981-07-29', championships: 2, hometown: 'Oviedo' },
  'STR': { nationality: '🇨🇦 Kanadisch',   born: '1998-10-29', championships: 0, hometown: 'Montreal' },
  'OCO': { nationality: '🇫🇷 Französisch', born: '1996-09-17', championships: 0, hometown: 'Nice' },
  'BEA': { nationality: '🇬🇧 Britisch',    born: '2005-05-08', championships: 0, hometown: 'Chelmsford' },
  'GAS': { nationality: '🇫🇷 Französisch', born: '1996-02-07', championships: 0, hometown: 'Rouen' },
  'COL': { nationality: '🇦🇷 Argentinisch', born: '2003-05-27', championships: 0, hometown: 'Buenos Aires' },
  'HUL': { nationality: '🇩🇪 Deutsch',     born: '1987-08-19', championships: 0, hometown: 'Emmerich' },
  'BOR': { nationality: '🇧🇷 Brasilianisch', born: '2004-09-15', championships: 0, hometown: 'São Paulo' },
  'PER': { nationality: '🇲🇽 Mexikanisch', born: '1990-01-26', championships: 0, hometown: 'Guadalajara' },
  'BOT': { nationality: '🇫🇮 Finnisch',    born: '1989-08-28', championships: 0, hometown: 'Nastola' },
}

export function getAge(born) {
  const d = new Date(born)
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--
  return age
}
