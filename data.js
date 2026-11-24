// Sample data for the LEDCS e-Sewa prototype. Replace with real IPR data.

const DEPTS = {
  GMC: 'Gangtok Municipal Corporation (GMC)',
  FOREST: 'Forest & Environment Department',
  TOURISM: 'Tourism & Civil Aviation Department',
  POLICE: 'Police Department',
  HOME: 'Home Department',
  ARMY: 'Indian Army',
  UDD: 'Urban Development Department (UDD)',
  ECCL: 'Ecclesiastical Department',
  CULTURE: 'Culture Department',
  IPR: 'IPR Department',
};

// Approver accounts for the Dashboard demo login.
const STAFF = [
  { role: 'AD', name: 'Mr. Bishal Khawas', title: 'Additional Director, Film Section, IPR', phone: '9775417549', email: 'ad.film@ledcs.demo' },
  { role: 'SECY', name: 'Ms. Annapurna Alley', title: 'Secretary, IPR Department', phone: '9775417549', email: 'secretary@ledcs.demo' },
  ...Object.keys(DEPTS).map(k => ({ role: k, name: 'Nodal Officer', title: DEPTS[k], phone: '98XXXXXXXX', email: k.toLowerCase() + '.nodal@ledcs.demo' })),
];

const DISTRICTS = ['Gangtok', 'Mangan', 'Namchi', 'Gyalshing', 'Pakyong', 'Soreng'];

// Venues double as the "shooting places" the applicant adds to the cart; dept = who grants the NOC.
// vr: YouTube video ID of a 360° recce video. Empty = opens a YouTube search instead.
// shortcut: vr IDs are blank until IPR supplies its own 360° videos, then paste the IDs here.
const LOCATIONS = [
  { id: 'paljor', name: 'Paljor Stadium', district: 'Gangtok', dept: 'GMC', fee: 25000, img: 'assets/paljor.png', season: 'March – May / September – December', capacity: '30,000', vr: '' },
  { id: 'mgmarg', name: 'M.G. Marg', district: 'Gangtok', dept: 'UDD', fee: 15000, img: 'assets/banner.jpg', season: 'March – May / October – December', capacity: '5,000', vr: '' },
  { id: 'changu', name: 'Tsomgo (Changu) Lake', district: 'Gangtok', dept: 'FOREST', fee: 20000, img: 'assets/lake.jpg', season: 'April – June / October – November', capacity: '500', vr: '' },
  { id: 'rumtek', name: 'Rumtek Monastery Premises', district: 'Gangtok', dept: 'ECCL', fee: 10000, img: 'assets/banner.jpg', season: 'All year', capacity: '300', vr: '' },
  { id: 'gurudongmar', name: 'Gurudongmar Lake', district: 'Mangan', dept: 'ARMY', fee: 20000, img: 'assets/lake.jpg', season: 'April – June / September – November', capacity: '200', vr: '' },
  { id: 'chardham', name: 'Char Dham Complex', district: 'Namchi', dept: 'CULTURE', fee: 15000, img: 'assets/banner.jpg', season: 'March – May / September – December', capacity: '3,000', vr: '' },
  { id: 'pelling', name: 'Pelling Skywalk', district: 'Gyalshing', dept: 'TOURISM', fee: 15000, img: 'assets/banner.jpg', season: 'March – May / September – December', capacity: '1,000', vr: '' },
];

// Public events (concerts, festivals). Separate from permission applications.
// vrPrice: fee for the VR viewing pass. vr: YouTube 360° video ID (empty = YouTube search).
const EVENTS = [
  { title: 'Orchid Music Festival 2025', district: 'Gangtok', venue: 'Paljor Stadium', date: '13 December 2025', img: 'assets/orchid.jpg', vr: '', vrPrice: 299,
    desc: 'The biggest music celebration of the year. Headliner Blue, with co-headliners EVERGLOW, Neetesh Jung Kunwar, Sonam Wangchen and Sofiyum Band.' },
  { title: 'Red Panda Winter Carnival', district: 'Gangtok', venue: 'M.G. Marg', date: 'December 2025', img: 'assets/banner.jpg', vr: '', vrPrice: 149,
    desc: 'Street food, music and cultural performances along M.G. Marg.' },
  { title: 'Namchi Mahotsav', district: 'Namchi', venue: 'Namchi Football Ground', date: 'December 2025', img: 'assets/banner.jpg', vr: '', vrPrice: 99,
    desc: 'Annual cultural and tourism festival of Namchi District.' },
  { title: 'Pelling Winter Festival', district: 'Gyalshing', venue: 'Pelling Helipad Ground', date: 'December 2025', img: 'assets/banner.jpg', vr: '', vrPrice: 99,
    desc: 'Music, local cuisine and adventure activities in the West.' },
];

const ACHIEVEMENTS = [
  { title: 'Most Film Friendly State', img: 'assets/award.jpg',
    desc: 'Sikkim received the Most Film Friendly State award at the 67th National Film Awards, Vigyan Bhawan, New Delhi, 25 October 2021.' },
];

// Database. "Filmable" = appears on camera; "Non-filmable" = crew, services and support.
const DATABASE = {
  Filmable: {
    'Artists': [
      { name: 'Pema Lhamu Bhutia', district: 'Gangtok', phone: '98XXXXXX01', skills: 'Acting, Theatre, Nepali & Hindi', about: 'Stage and screen artist with 8 years of experience in regional films.' },
      { name: 'Rohan Rai', district: 'Namchi', phone: '98XXXXXX02', skills: 'Acting, Modelling', about: 'Model and actor, featured in music videos shot across Sikkim.' },
    ],
    'Musicians': [
      { name: 'Tashi Wangchuk Lepcha', district: 'Mangan', phone: '98XXXXXX03', skills: 'Guitar, Vocals, Folk', about: 'Folk musician performing traditional Lepcha music.' },
    ],
    'Choreographers': [
      { name: 'Sangita Gurung', district: 'Gangtok', phone: '98XXXXXX04', skills: 'Contemporary, Folk dance', about: 'Choreographer for stage events and festivals.' },
    ],
  },
  'Non-filmable': {
    'Technicians': [{ name: 'Karma Tamang', district: 'Gangtok', phone: '98XXXXXX05', skills: 'Lighting, Grip', about: 'Lighting technician for live shows.' }],
    'Producers': [{ name: 'Daniel Biswakarma', district: 'Gyalshing', phone: '98XXXXXX06', skills: 'Line Production', about: 'Line producer for feature films in West Sikkim.' }],
    'Make-up Artists': [{ name: 'Anjali Pradhan', district: 'Gangtok', phone: '98XXXXXX07', skills: 'Film & Bridal make-up', about: 'Make-up artist for film and stage.' }],
    'Video Editor / Drone Pilot': [{ name: 'Bhivek Chhetri', district: 'Gangtok', phone: '98XXXXXX08', skills: 'Video editing, Drone piloting', about: 'Freelance video editor and drone pilot, Sikkim.' }],
    'Equipment': [{ name: 'Himalayan Sound & Light', district: 'Gangtok', phone: '98XXXXXX09', skills: 'Stage, Sound, Lighting rental', about: 'Stage and PA systems for events up to 20,000 people.' }],
    'Empanelled Event Organisers': [{ name: 'Sonju Events', district: 'Gangtok', phone: '98XXXXXX10', skills: 'Concerts, Festivals', about: 'Empanelled organiser, Orchid Music Festival 2025.' }],
    'Luxury Vehicles / Bus': [{ name: 'Kanchenjunga Travels', district: 'Gangtok', phone: '98XXXXXX11', skills: 'Tempo travellers, Buses', about: 'Crew transport across all districts.' }],
    'Hotels / Homestays': [{ name: 'Norbu Ghang Retreat', district: 'Gyalshing', phone: '98XXXXXX12', skills: 'Hotel, 40 rooms', about: 'Crew accommodation in Pelling.' }],
    'Emergency Contacts': [
      { name: 'District Collector, Gangtok', district: 'Gangtok', phone: '03592-XXXXXX', skills: 'DC', about: 'District administration.' },
      { name: 'Superintendent of Police, East', district: 'Gangtok', phone: '03592-XXXXXX', skills: 'SP', about: 'Police and crowd management.' },
      { name: 'STNM Hospital', district: 'Gangtok', phone: '03592-XXXXXX', skills: 'Hospital', about: 'Medical emergency.' },
      { name: 'Power Department Control Room', district: 'Gangtok', phone: '03592-XXXXXX', skills: 'Power', about: 'Electricity supply for events.' },
    ],
  },
};
