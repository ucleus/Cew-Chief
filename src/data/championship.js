export const RACING_CLASSES = ["MotoGP", "Moto2", "Moto3"];

export const CLASS_BIKES = {
  MotoGP: [
    "Aprilia RS-GP",
    "Ducati Desmosedici GP",
    "Honda RC213V",
    "KTM RC16",
    "Yamaha YZR-M1",
  ],
  Moto2: ["Boscoscuro B-26", "Kalex Moto2", "Yamaha Moto2"],
  Moto3: ["Honda NSF250RW", "KTM RC 250 GP"],
};

export const CLASS_TEAMS = {
  MotoGP: [
    "Aprilia Racing",
    "BK8 Gresini Racing MotoGP",
    "Ducati Lenovo Team",
    "Honda HRC Castrol",
    "Honda LCR",
    "Monster Energy Yamaha MotoGP",
    "Pertamina Enduro VR46 Racing Team",
    "Prima Pramac Yamaha MotoGP",
    "Red Bull KTM Factory Racing",
    "Red Bull KTM Tech3",
    "SuperFile Trackhouse MotoGP Team",
  ],
  Moto2: [
    "BLU CRU Pramac Yamaha Moto2",
    "CFMoto Aspar Team",
    "Elf Marc VDS Racing Team",
    "Honda Team Asia",
    "Italjet Gresini Moto2",
    "Italtrans Racing Team",
    "Klint Racing Team",
    "Liqui Moly Dynavolt Intact GP",
    "Momoven Idrofoglia RW Racing Team",
    "OnlyFans American Racing Team",
    "QJ Motor - Galfer - MSI",
    "Red Bull KTM Ajo",
    "Reds Fanatic Racing",
    "SpeedRS Team",
  ],
  Moto3: [
    "Ajo Credit - MT Helmets - MSI",
    "CFMoto Gaviota Aspar Team",
    "CIP Green Power",
    "Code Motorsports",
    "GRYD Racing",
    "Honda Team Asia",
    "Leopard Racing",
    "Level Up - MTA",
    "Liqui Moly Dynavolt Intact GP",
    "Red Bull KTM Ajo",
    "Red Bull KTM Tech3",
    "Rivacold Snipers Team",
    "SIC58 Squadra Corse",
  ],
};

// You pick a team; the garage belongs to the bike underneath it. Two teams
// on the same bike (Gresini and Ducati Lenovo) share physics but keep
// separate tunes.
export const TEAM_BIKE = {
  "Aprilia Racing": "Aprilia RS-GP",
  "SuperFile Trackhouse MotoGP Team": "Aprilia RS-GP",
  "BK8 Gresini Racing MotoGP": "Ducati Desmosedici GP",
  "Ducati Lenovo Team": "Ducati Desmosedici GP",
  "Pertamina Enduro VR46 Racing Team": "Ducati Desmosedici GP",
  "Honda HRC Castrol": "Honda RC213V",
  "Honda LCR": "Honda RC213V",
  "Monster Energy Yamaha MotoGP": "Yamaha YZR-M1",
  "Prima Pramac Yamaha MotoGP": "Yamaha YZR-M1",
  "Red Bull KTM Factory Racing": "KTM RC16",
  "Red Bull KTM Tech3": "KTM RC16",
};
