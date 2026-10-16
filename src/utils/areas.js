const DISTRICTS = [
  "Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo", "Galle",
  "Gampaha", "Hambantota", "Jaffna", "Kalutara", "Kandy", "Kegalle",
  "Kilinochchi", "Kurunegala", "Mannar", "Matale", "Matara", "Monaragala",
  "Mullaitivu", "Nuwara Eliya", "Polonnaruwa", "Puttalam", "Ratnapura",
  "Trincomalee", "Vavuniya",
];

// River-basin target labels from Irrigation Department, Hydrological Annual 2021/22.
// The Kelani label preserves the name already used by accounts in this application.
const RIVER_BASINS = [
  "Kelani River Basin", "Bolgoda Ganga", "Kalu Ganga", "Bentara Ganga", "Madu Ganga",
  "Madampe Ganga", "Telwatta Ganga", "Ratgama Lake", "Gin Ganga", "Koggala Ganga",
  "Polwatta Ganga", "Nilwala Ganga", "Sinimodara Oya", "Kirama Oya", "Rekawa Oya",
  "Urubokka Oya", "Kachchigal Ara", "Walawe Ganga", "Karagan Oya", "Malala Oya",
  "Embilikala Oya", "Kirindi Oya", "Bambawe Ara", "Mahaseelawa Oya", "Buthawa Oya",
  "Menik Ganga", "Katupila Ara", "Kurunda Ara", "Nabadagas Ara", "Karambe Ara",
  "Kumbukkan Oya", "Bagura Oya", "Girikula Oya", "Helawa Ara", "Wila Oya", "Heda Oya",
  "Karanda Oya", "Semena Ara", "Tandiadi Aru", "Kangikadichi Aru", "Rufus Kulam",
  "Pannel Oya", "Ambalan Oya", "Gal Oya", "Andella Oya", "Tumpan Keni", "Namakada Aru",
  "Mandipattu Aru", "Pathantoppu Aru", "Vett Aru", "Magalavatavan Aru", "Mundeni Aru",
  "Miyangolla Ela", "Maduru Oya", "Pulliyanpota Aru", "Kirimechchi Odai", "Bodigolla Aru",
  "Mandan Aru", "Makarachchi Aru", "Mahaweli Ganga", "Kantalai Aru", "Palampotta Aru",
  "Panna Oya", "Pankulam Aru", "Kunchikumban Aru", "Palakutta Aru", "Yan Oya", "Mi Oya",
  "Ma Oya", "Churiya Aru", "Chavar Aru", "Palladi Aru", "Manal Aru", "Kodalikallu Aru",
  "Per Aru", "Pali Aru (Basin 76)", "Maruthapillay Ary", "Thervil Aru", "Piramanthal Aru", "Methali Aru",
  "Kanakarayan Aru", "Kalwalappu Aru", "Akkarayan Aru", "Mandekal Aru", "Pallavarayan Kaddu Aru",
  "Pali Aru (Basin 86)", "Chappi Aru", "Parangi Aru", "Nay Aru", "Malwathu Oya", "Kal Aru",
  "Moderagama Aru", "Kala Oya", "Moongil Aru", "Mee Oya", "Madurankuli Aru", "Kalagamune Oya",
  "Rathambala Oya", "Deduru Oya", "Karambala Oya", "Ratmal Oya", "Maha Oya", "Attanagalu Oya",
];

const AREA_NAMES = [...DISTRICTS, ...RIVER_BASINS];
const AREA_BY_NORMALIZED_NAME = new Map(
  AREA_NAMES.map((area) => [area.trim().toLocaleLowerCase("en"), area]),
);

function normalizeAreaName(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return AREA_BY_NORMALIZED_NAME.get(trimmed.toLocaleLowerCase("en")) || "";
}

module.exports = { DISTRICTS, RIVER_BASINS, normalizeAreaName };
