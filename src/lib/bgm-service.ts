export interface BgmLoop {
  id: string;
  title: string;
  mood: string[];
  genre: string[];
  bpm: number;
  key: string;
  instruments: string[];
  loopSeconds: number;
  license: string;
  fileUrl: string | null;
  available: boolean;
}

export const BGM_LOOP_LIBRARY: BgmLoop[] = [
  {
    id: "loop_001",
    title: "Neon Rain",
    mood: ["tense", "noir", "investigation", "dark"],
    genre: ["cyberpunk", "synthwave", "noir"],
    bpm: 82,
    key: "Am",
    instruments: ["dark synth pad", "sub bass pulse", "metallic percussion"],
    loopSeconds: 32,
    license: "cc0",
    fileUrl: "/audio/neon_rain_32s.mp3",
    available: false,
  },
  {
    id: "loop_002",
    title: "Tavern Hearth",
    mood: ["warm", "cozy", "mysterious", "folk"],
    genre: ["fantasy", "medieval", "folk"],
    bpm: 90,
    key: "Dm",
    instruments: ["lute", "flute", "soft drums", "hurdy-gurdy"],
    loopSeconds: 32,
    license: "cc0",
    fileUrl: "/audio/tavern_hearth_32s.mp3",
    available: false,
  },
  {
    id: "loop_003",
    title: "Deep Space",
    mood: ["isolated", "vast", "tense", "sci-fi"],
    genre: ["sci-fi", "ambient", "space"],
    bpm: 60,
    key: "Cm",
    instruments: ["ambient pad", "slow arpeggio", "distant choir"],
    loopSeconds: 32,
    license: "cc0",
    fileUrl: "/audio/deep_space_32s.mp3",
    available: false,
  },
  {
    id: "loop_004",
    title: "Campfire Shadows",
    mood: ["horror", "eerie", "suspense", "dark"],
    genre: ["horror", "ambient", "folk"],
    bpm: 70,
    key: "Em",
    instruments: ["dissonant strings", "whispered choir", "creaking wood"],
    loopSeconds: 16,
    license: "cc0",
    fileUrl: "/audio/campfire_shadows_16s.mp3",
    available: false,
  },
  {
    id: "loop_005",
    title: "Clockwork City",
    mood: ["mechanical", "busy", "steampunk", "industrial"],
    genre: ["steampunk", "industrial", "adventure"],
    bpm: 110,
    key: "Gm",
    instruments: ["brass section", "mechanical percussion", "pipe organ"],
    loopSeconds: 16,
    license: "cc0",
    fileUrl: "/audio/clockwork_city_16s.mp3",
    available: false,
  },
  {
    id: "loop_006",
    title: "School Bell Echo",
    mood: ["nostalgic", "mysterious", "quiet", "tense"],
    genre: ["mystery", "ambient", "school"],
    bpm: 75,
    key: "Fm",
    instruments: ["piano", "soft strings", "distant bell"],
    loopSeconds: 32,
    license: "cc0",
    fileUrl: "/audio/school_bell_echo_32s.mp3",
    available: false,
  },
  {
    id: "loop_007",
    title: "Desert Wind",
    mood: ["desolate", "vast", "survival", "harsh"],
    genre: ["post-apocalyptic", "ambient", "western"],
    bpm: 65,
    key: "Dm",
    instruments: ["slide guitar", "wind ambience", "distant drums"],
    loopSeconds: 32,
    license: "cc0",
    fileUrl: "/audio/desert_wind_32s.mp3",
    available: false,
  },
  {
    id: "loop_008",
    title: "Palace Intrigue",
    mood: ["scheming", "elegant", "tense", "political"],
    genre: ["historical", "court", "drama"],
    bpm: 85,
    key: "Bbm",
    instruments: ["harpsichord", "strings", "timpani"],
    loopSeconds: 32,
    license: "cc0",
    fileUrl: "/audio/palace_intrigue_32s.mp3",
    available: false,
  },
];

export interface BgmMatchResult {
  matched: boolean;
  loop?: BgmLoop;
  score: number;
}

export function matchBgmLoop(bgmCue: {
  mood: string;
  bpm: number;
  instruments: string[];
  loopSeconds: number;
}): BgmMatchResult {
  let bestMatch: BgmLoop | null = null;
  let bestScore = 0;

  const cueMoodLower = bgmCue.mood.toLowerCase();
  const cueInstrumentsLower = bgmCue.instruments.map((i) => i.toLowerCase());

  for (const loop of BGM_LOOP_LIBRARY) {
    let score = 0;

    const moodOverlap = loop.mood.filter((m) =>
      cueMoodLower.includes(m.toLowerCase()) || m.toLowerCase().includes(cueMoodLower.split(" ")[0])
    ).length;
    score += moodOverlap * 30;

    const genreOverlap = loop.genre.filter((g) =>
      cueMoodLower.includes(g.toLowerCase())
    ).length;
    score += genreOverlap * 20;

    const bpmDiff = Math.abs(loop.bpm - bgmCue.bpm);
    if (bpmDiff <= 15) {
      score += 20 - bpmDiff;
    }

    const instrumentOverlap = loop.instruments.filter((inst) =>
      cueInstrumentsLower.some((ci) =>
        inst.toLowerCase().includes(ci) || ci.includes(inst.toLowerCase())
      )
    ).length;
    score += instrumentOverlap * 10;

    if (loop.loopSeconds === bgmCue.loopSeconds) {
      score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = loop;
    }
  }

  return {
    matched: bestScore >= 20 && bestMatch !== null,
    loop: bestMatch || undefined,
    score: bestScore,
  };
}
