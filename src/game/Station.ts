const STATION_NAMES: string[] = [
  "Aldermere",     "Aldwick",       "Ashbourne",     "Ashwick",       "Barrowfield",
  "Barwick",       "Blackthorn",    "Blythewick",    "Brackenhall",   "Bridgewick",
  "Brookminster",  "Burnhamwick",   "Castleford",    "Charnwick",     "Claybourne",
  "Cliftonmere",   "Copperthwaite", "Cranfield",     "Dalebridge",    "Deepford",
  "Dunhollow",     "Earlswick",     "Eastmere",      "Elmbridge",     "Fairhaven",
  "Fernwick",      "Foxbourne",     "Gateford",      "Glenhurst",     "Greymere",
  "Grimshaw",      "Hackford",      "Halsworth",     "Hampford",      "Hartbourne",
  "Haverwick",     "Heathfield",    "Holbrook",      "Holmwick",      "Hullminster",
  "Hungerford",    "Ironbridge",    "Ivyhollow",     "Kesterwick",    "Kettlebourne",
  "Kingstone",     "Knareswick",    "Langhollow",    "Langwick",      "Leaford",
  "Leatherwick",   "Leeminster",    "Limbourne",     "Lindwick",      "Loxbourne",
  "Lynhurst",      "Maplewood",     "Marshwick",     "Mereford",      "Millbourne",
  "Moorfield",     "Muirstone",     "Nettlewick",    "Newbridge",     "Northbourne",
  "Oakenford",     "Oakminster",    "Oldwick",       "Ormswick",      "Overbridge",
  "Paddlewick",    "Pembridge",     "Pewtermere",    "Plumbridge",    "Porterswick",
  "Ravenwick",     "Rawcliffe",     "Redbourne",     "Ridgefield",    "Riverstone",
  "Rochford",      "Rookwick",      "Rosewarne",     "Saltwick",      "Sandbourne",
  "Saxonford",     "Seabridge",     "Shallowford",   "Silverbourne",  "Skipwick",
  "Slaidwick",     "Snowbourne",    "Stanwick",      "Stonebridge",   "Stourwick",
  "Strettonwick",  "Thornbourne",   "Thornwick",     "Tidebourne",    "Torfield",
  "Underwick",     "Upperford",     "Wakefield",     "Wallingwick",   "Warmwick",
  "Waterbourne",   "Wethwick",      "Whitbourne",    "Wickfield",     "Wilderwick",
  "Willowmere",    "Winterbourne",  "Wychford",      "Yarwick",       "Yewbourne",
  "Yorewick",      "Zetherwick",
];

const usedNames = new Set<string>();

export function getRandomStationName(): string {
  const available = STATION_NAMES.filter(n => !usedNames.has(n));
  if (available.length === 0) {
    usedNames.clear();
    return getRandomStationName();
  }
  const name = available[Math.floor(Math.random() * available.length)];
  usedNames.add(name);
  return name;
}
