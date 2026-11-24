// Sample data for the Sikkim Film Connect e-Sewa prototype. Replace with real IPR data.

const DEPTS = {
  GMC: 'Gangtok Municipal Corporation (GMC)',
  FOREST: 'Forest & Environment Department',
  TOURISM: 'Tourism & Civil Aviation Department',
  POLICE: 'Police Department',
  FIRE: 'Fire & Emergency Services',
  HOME: 'Home Department',
  ARMY: 'Indian Army',
  UDD: 'Urban Development Department (UDD)',
  ECCL: 'Ecclesiastical Department',
  CULTURE: 'Culture Department',
  IPR: 'IPR Department',
};

// Maximum processing time in working days (Clause 23). AD = Facilitation Cell (preliminary scrutiny).
// Departments not listed get DEFAULT. Overdue files are escalated to the State Nodal Officer (Secretary, IPR).
const TIMELINES = { AD: 2, POLICE: 7, FIRE: 7, FOREST: 10, TOURISM: 5, DEFAULT: 7 };

// Approver accounts for the Dashboard demo login.
const STAFF = [
  { role: 'AD', name: 'Mr. Bishal Khawas', title: 'Additional Director, Film Section, IPR (Facilitation Cell)', phone: '9775417549', email: 'ad.film@scn.demo' },
  { role: 'SECY', name: 'Ms. Annapurna Alley', title: 'Secretary, IPR (State Nodal Officer)', phone: '9775417549', email: 'secretary@scn.demo' },
  ...Object.keys(DEPTS).map(k => ({ role: k, name: 'Nodal Officer', title: DEPTS[k], phone: '98XXXXXXXX', email: k.toLowerCase() + '.nodal@scn.demo' })),
];

const DISTRICTS = ['Gangtok', 'Mangan', 'Namchi', 'Gyalshing', 'Pakyong', 'Soreng'];

// for: 'shoot' = notified filming location, 'event' = approved event venue. dept = who grants the NOC.
// fee: venue fee for live events (shooting uses SHOOT_RATES instead).
// vr: YouTube video ID of a 360° recce video. Empty = opens a YouTube search instead.
// shortcut: vr IDs are blank until IPR supplies its own 360° videos, then paste the IDs here.
const LOCATIONS = [
  { id: 'changu', for: ['shoot'], name: 'Tsomgo (Changu) Lake', district: 'Gangtok', dept: 'FOREST', img: 'assets/lake.jpg', season: 'April – June / October – November', access: '38 km from Gangtok. Protected Area Permit needed.', vr: '' },
  { id: 'lachung', for: ['shoot'], name: 'Lachung', district: 'Mangan', dept: 'FOREST', img: 'assets/sikkim.jpg', season: 'March – June / October – December', access: '118 km from Gangtok. Protected Area Permit needed.', vr: '' },
  { id: 'yumthang', for: ['shoot'], name: 'Yumthang Valley', district: 'Mangan', dept: 'FOREST', img: 'assets/sikkim.jpg', season: 'March – May (rhododendron bloom)', access: '24 km from Lachung. Protected Area Permit needed.', vr: '' },
  { id: 'gurudongmar', for: ['shoot'], name: 'Gurudongmar Lake', district: 'Mangan', dept: 'ARMY', img: 'assets/lake.jpg', season: 'April – June / September – November', access: 'Via Lachen. Army clearance needed.', vr: '' },
  { id: 'rumtek', for: ['shoot'], name: 'Rumtek Monastery Premises', district: 'Gangtok', dept: 'ECCL', img: 'assets/banner.jpg', season: 'All year', access: '24 km from Gangtok by road.', vr: '' },
  { id: 'pelling', for: ['shoot', 'event'], name: 'Pelling Skywalk', district: 'Gyalshing', dept: 'TOURISM', fee: 15000, img: 'assets/banner.jpg', season: 'March – May / September – December', capacity: '1,000', access: '130 km from Gangtok.', vr: '' },
  { id: 'paljor', for: ['event'], name: 'Paljor Stadium', district: 'Gangtok', dept: 'GMC', fee: 25000, img: 'assets/paljor.png', season: 'March – May / September – December', capacity: '30,000', access: 'Gangtok town centre.', vr: '' },
  { id: 'mgmarg', for: ['shoot', 'event'], name: 'M.G. Marg', district: 'Gangtok', dept: 'UDD', fee: 15000, img: 'assets/banner.jpg', season: 'March – May / October – December', capacity: '5,000', access: 'Gangtok town centre. Pedestrian zone.', vr: '' },
  { id: 'chardham', for: ['shoot', 'event'], name: 'Char Dham Complex', district: 'Namchi', dept: 'CULTURE', fee: 15000, img: 'assets/banner.jpg', season: 'March – May / September – December', capacity: '3,000', access: '5 km from Namchi town.', vr: '' },
  { id: 'namchiground', for: ['event'], name: 'Namchi Football Ground', district: 'Namchi', dept: 'UDD', fee: 12000, img: 'assets/paljor.png', season: 'October – March', capacity: '8,000', access: 'Namchi town centre.', vr: '' },
];

// Shooting permission fee by project type (covers the first location). Sample rates.
const SHOOT_RATES = {
  'Feature Film': 50000, 'Web Series': 30000, 'Television Programme': 20000, 'Advertisement': 25000,
  'Documentary': 10000, 'Music Video': 10000, 'Digital Content': 5000,
};
const EXTRA_LOCATION_FEE = 10000;

// Viewing passes for public live events.
const PASSES = [
  { id: 'digital', name: 'Digital Pass', desc: 'Watch the live event in HD (Web, Mobile, TV)', price: 299 },
  { id: '360', name: '360° Pass', desc: 'Immerse in a 360° interactive live view', price: 499 },
  { id: 'vr', name: 'VR Premium Pass', desc: 'Full VR experience (use with VR Cardboard)', price: 699, best: true },
];
const CARDBOARD_PRICE = 200;

// Public events (concerts, festivals). Separate from permission applications.
// vr: YouTube 360° video ID (empty = YouTube search).
const EVENTS = [
  { title: 'Orchid Music Festival 2025', district: 'Gangtok', venue: 'Paljor Stadium', date: '13 December 2025', img: 'assets/orchid.jpg', vr: '',
    desc: 'The biggest music celebration of the year. Headliner Blue, with co-headliners EVERGLOW, Neetesh Jung Kunwar, Sonam Wangchen and Sofiyum Band.' },
  { title: 'Sikkim Music Fest 2026', district: 'Gangtok', venue: 'Paljor Stadium', date: '20 March 2026', img: 'assets/concert.jpg', vr: '',
    desc: 'Watch live from anywhere in the world: HD stream, 360° view or full VR.' },
  { title: 'Red Panda Winter Carnival', district: 'Gangtok', venue: 'M.G. Marg', date: 'December 2025', img: 'assets/banner.jpg', vr: '',
    desc: 'Street food, music and cultural performances along M.G. Marg.' },
  { title: 'Namchi Mahotsav', district: 'Namchi', venue: 'Namchi Football Ground', date: 'December 2025', img: 'assets/banner.jpg', vr: '',
    desc: 'Annual cultural and tourism festival of Namchi District.' },
];

const ACHIEVEMENTS = [
  { title: 'Most Film Friendly State', img: 'assets/award.jpg',
    desc: 'Sikkim received the Most Film Friendly State award at the 67th National Film Awards, Vigyan Bhawan, New Delhi, 25 October 2021.' },
];

// Resource directory. Filmic = film production resources; Non-Filmic = support services for shoots and events.
// Optional profile fields: role, exp, projects, verified, skillBars [[name, %]], education, work, awards, reviews.
const DATABASE = {
  'Filmic Resources': {
    'Casting Agencies': [{ name: 'Himalayan Casting Co.', district: 'Gangtok', phone: '98XXXXXX13', skills: 'Casting for films, ads and web series', about: 'Casting agency with a pool of 300+ local actors and extras.' }],
    'Equipment Rental': [{ name: 'Himalayan Sound & Light', district: 'Gangtok', phone: '98XXXXXX09', skills: 'Camera, Stage, Sound, Lighting rental', about: 'Camera kits, stage and PA systems for shoots and events up to 20,000 people.' }],
    'Film Studios': [{ name: 'Kanchenjunga Studio', district: 'Gangtok', phone: '98XXXXXX14', skills: 'Indoor floor, Green screen', about: '4,000 sq ft shooting floor with green screen and make-up rooms.' }],
    'Filmmakers & Talent': [
      { name: 'Bhivek Chhetri', role: 'Video Editor / Drone Pilot', district: 'Gangtok', phone: '98XXXXXX08', skills: 'Video editing, Drone piloting', exp: '6+', projects: 18, verified: true,
        about: 'A creative video editor and certified drone pilot based in Sikkim, with experience in documentaries, travel films and promotional content.',
        skillBars: [['Video Editing', 95], ['Drone Operation', 90], ['Cinematography', 85], ['Color Grading', 80]],
        education: 'Certification in Aerial Cinematography (Drone), 2020 – 2021',
        work: 'Freelance Video Editor & Drone Pilot, 2019 – Present. Documentaries, tourism promos and event coverage in Sikkim.',
        awards: ['Best Editing, Local Film Festival (2024)', 'Featured Creator, Sikkim Tourism Content Series (2023)'],
        reviews: [{ by: 'Anita Sharma', as: 'Producer', stars: 5, at: '2026-03-12', text: 'Excellent editing quality and very professional. Highly recommended for documentary and travel projects.' },
                  { by: 'Rohit Das', as: 'Director', stars: 4.5, at: '2026-01-28', text: 'Skilled drone operations and great understanding of visual storytelling.' }] },
      { name: 'Tenzing Bhutia', role: 'Actor', district: 'Gangtok', phone: '98XXXXXX15', skills: 'Acting, Theatre', about: 'Screen and stage actor.', reviews: [{ by: 'Anita Sharma', as: 'Producer', stars: 4.7, at: '2026-02-02', text: 'Natural screen presence.' }] },
      { name: 'Pema Lhamu Bhutia', role: 'Actor', district: 'Gangtok', phone: '98XXXXXX01', skills: 'Acting, Theatre, Nepali & Hindi', about: 'Stage and screen artist with 8 years of experience in regional films.', reviews: [{ by: 'Rohit Das', as: 'Director', stars: 4.6, at: '2026-01-10', text: 'Reliable and well prepared.' }] },
      { name: 'Arjun Rai', role: 'Camera Assistant', district: 'Namchi', phone: '98XXXXXX16', skills: 'Focus pulling, Camera prep', about: 'Camera assistant on feature films and ads.', reviews: [{ by: 'Anita Sharma', as: 'Producer', stars: 4.5, at: '2025-12-20', text: 'Hard working.' }] },
      { name: 'Tashi Wangchuk Lepcha', role: 'Musician', district: 'Mangan', phone: '98XXXXXX03', skills: 'Guitar, Vocals, Folk', about: 'Folk musician performing traditional Lepcha music.' },
      { name: 'Sangita Gurung', role: 'Choreographer', district: 'Gangtok', phone: '98XXXXXX04', skills: 'Contemporary, Folk dance', about: 'Choreographer for stage events and festivals.' },
      { name: 'Anjali Pradhan', role: 'Make-up Artist', district: 'Gangtok', phone: '98XXXXXX07', skills: 'Film & Bridal make-up', about: 'Make-up artist for film and stage.' },
      { name: 'Karma Tamang', role: 'Technician', district: 'Gangtok', phone: '98XXXXXX05', skills: 'Lighting, Grip', about: 'Lighting technician for shoots and live shows.' },
      { name: 'Daniel Biswakarma', role: 'Line Producer', district: 'Gyalshing', phone: '98XXXXXX06', skills: 'Line Production', about: 'Line producer for feature films in West Sikkim.' },
    ],
    'Property Rental': [{ name: 'Old Gangtok Heritage House', district: 'Gangtok', phone: '98XXXXXX17', skills: 'Heritage home for period shoots', about: 'Traditional Sikkimese house available for shoots.' }],
    'Post Production Companies': [{ name: 'Teesta Post', district: 'Gangtok', phone: '98XXXXXX18', skills: 'Edit, DI, Sound mixing', about: 'Editing suites, colour grading and sound mix.' }],
    'Talent Sourcing Companies': [{ name: 'Sonju Events', district: 'Gangtok', phone: '98XXXXXX10', skills: 'Artists, Crew, Empanelled event organiser', about: 'Empanelled organiser, Orchid Music Festival 2025.' }],
  },
  'Non-Filmic Resources': {
    'Catering Units': [{ name: 'Mountain Kitchen Caterers', district: 'Gangtok', phone: '98XXXXXX19', skills: 'On-location catering, 500 plates/day', about: 'Crew and event catering across East Sikkim.' }],
    'Hotels & Accommodation': [{ name: 'Norbu Ghang Retreat', district: 'Gyalshing', phone: '98XXXXXX12', skills: 'Hotel, 40 rooms', about: 'Crew accommodation in Pelling.' }],
    'Medical Facilities': [{ name: 'STNM Hospital', district: 'Gangtok', phone: '03592-XXXXXX', skills: 'Hospital, Ambulance', about: 'Medical emergency.' }],
    'Security Services': [
      { name: 'Superintendent of Police, East', district: 'Gangtok', phone: '03592-XXXXXX', skills: 'Police, Crowd management', about: 'Police and crowd management.' },
      { name: 'Snow Lion Security', district: 'Gangtok', phone: '98XXXXXX20', skills: 'Private security, Bouncers', about: 'Event security staff.' },
    ],
    'Travel Operators': [{ name: 'Kanchenjunga Travels', district: 'Gangtok', phone: '98XXXXXX11', skills: 'Luxury vehicles, Tempo travellers, Buses', about: 'Crew transport across all districts.' }],
    'Emergency Contacts': [
      { name: 'District Collector, Gangtok', district: 'Gangtok', phone: '03592-XXXXXX', skills: 'DC', about: 'District administration.' },
      { name: 'Power Department Control Room', district: 'Gangtok', phone: '03592-XXXXXX', skills: 'Power', about: 'Electricity supply for shoots and events.' },
    ],
  },
};
