// Schematic circuit outlines — hand-drawn by Claude for visual recognition
// and sector division, NOT traced from survey data or any copyrighted map.
// Shape, direction and rough corner sequence aim to be recognizable; exact
// geometry is not accurate. Matched by track name to mg_tracks.
//
// Every entry uses the same viewBox and drawing style so all tracks look
// like one consistent set rather than a patchwork of different sources.

export const MAP_VIEWBOX = "0 0 800 480";

export const TRACK_MAPS = {
  "Mugello Circuit": {
    direction: "CW",
    path: "M 80,420 L 620,420 C 680,420 700,400 700,360 C 700,320 670,300 630,290 C 590,280 560,260 560,220 C 560,180 590,160 630,150 C 670,140 690,110 670,80 C 650,50 600,50 560,70 C 520,90 480,90 450,70 C 420,50 380,60 370,100 C 360,140 330,150 290,140 C 250,130 210,140 190,170 C 170,200 140,210 110,200 C 80,190 60,210 60,250 L 60,380 C 60,405 65,420 80,420 Z",
  },
  "Silverstone Circuit": {
    direction: "CW",
    path: "M 60,200 C 60,160 90,140 130,150 C 170,160 200,140 210,100 C 220,60 260,40 300,60 C 340,80 380,70 400,40 C 420,10 460,10 480,40 C 500,70 540,80 570,60 C 600,40 640,50 650,90 C 660,130 700,150 730,130 C 760,110 780,140 760,170 C 740,200 740,240 760,270 C 780,300 760,330 730,320 C 700,310 670,330 670,370 C 670,410 630,430 590,410 C 550,390 510,400 490,430 C 470,460 430,460 410,430 C 390,400 350,390 320,410 C 290,430 250,420 240,380 C 230,340 190,320 150,330 C 110,340 70,320 60,280 Z",
  },
};
