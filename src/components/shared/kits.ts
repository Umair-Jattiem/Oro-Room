/* Football legends and their national-team kit colours, shared by the main site and the room.
   Kit art is drawn from these colours only: no official crests, badges or sponsor marks. */

export type Kit = {
  id: string;
  name: string;     // printed on the beanbag
  num: number;      // shirt number
  team: string;
  hex: string;      // main kit colour
  hex2: string;     // second colour (stripes, checks, ring)
  ink: string;      // colour of the name and number
  pattern?: 'stripes' | 'checks';
  theme: string;    // base colour for the page background behind this kit
};

export const KITS: Kit[] = [
  { id: 'messi',   name: 'Messi',   num: 10, team: 'Argentina', hex: '#75AADB', hex2: '#F7F7F2', ink: '#14213D', pattern: 'stripes', theme: '#3E78B2' },
  { id: 'ronaldo', name: 'Ronaldo', num: 7,  team: 'Portugal',  hex: '#B5121B', hex2: '#0B6B3A', ink: '#E9C46A', theme: '#9E1A22' },
  { id: 'neymar',  name: 'Neymar',  num: 10, team: 'Brazil',    hex: '#F6D21F', hex2: '#119A46', ink: '#13357E', theme: '#16884A' },
  { id: 'pogba',   name: 'Pogba',   num: 6,  team: 'France',    hex: '#1C2752', hex2: '#C8102E', ink: '#F4F4F2', theme: '#25356E' },
  { id: 'modric',  name: 'Modric',  num: 10, team: 'Croatia',   hex: '#D0102F', hex2: '#F5F5F2', ink: '#12215E', pattern: 'checks', theme: '#B3172F' },
  { id: 'salah',   name: 'Salah',   num: 11, team: 'Egypt',     hex: '#C0161D', hex2: '#111111', ink: '#F4F4F2', theme: '#A1171D' },
  { id: 'haaland', name: 'Haaland', num: 9,  team: 'Norway',    hex: '#BA0C2F', hex2: '#00205B', ink: '#F4F4F2', theme: '#8F1430' },
  { id: 'kane',    name: 'Kane',    num: 9,  team: 'England',   hex: '#F2F2EE', hex2: '#0B1F4D', ink: '#0B1F4D', theme: '#1F3266' },
];

export const kitById = (id: string) => KITS.find((k) => k.id === id) || KITS[0];
