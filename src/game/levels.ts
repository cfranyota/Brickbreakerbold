export const COLS = 7;
export const ROWS = 14;

export const POWERS = [
  "longer",
  "slow",
  "shorter",
  "fast",
  "missile",
  "life",
  "ufo",
  "flip",
  "wrap",
  "score",
] as const;

export type Power = (typeof POWERS)[number];

export type Cell = {
  i: number;
  hits: number;
  power?: Power | "random";
  switcher?: 1 | 2;
  switchable?: boolean;
  hidden?: boolean;
};

const h = (
  i: number,
  hits: number,
  extra: Omit<Cell, "i" | "hits"> = {},
): Cell => ({ i, hits, ...extra });

const vis = (ids: number[], hits: number): Cell[] =>
  ids.map((i) => h(i, hits, { switchable: true }));

const hid = (ids: number[], hits: number, power?: Power | "random"): Cell[] =>
  ids.map((i) => h(i, hits, { switchable: true, hidden: true, power }));

/** Nine boards from BrickBreaker Bold 2.2 (Apache 2.0), column count 7. */
export const LEVELS: Cell[][] = [
  [
    ...[9, 10, 16, 18, 23, 25, 30, 31, 37, 39, 44, 46, 51, 52].map((i) =>
      h(i, 2),
    ),
  ],
  [
    h(0, 1),
    h(6, 1),
    h(8, 1, { power: "random" }),
    h(12, 1, { power: "random" }),
    h(16, 1),
    h(18, 1),
    h(24, 3),
    h(30, 1),
    h(32, 1),
    h(38, 2),
  ],
  [
    h(9, 1, { power: "random" }),
    h(11, 1, { power: "random" }),
    h(15, 3),
    h(17, 1, { power: "random" }),
    h(19, 3),
    h(23, 1),
    h(25, 1),
    h(31, 3),
    h(37, 2),
    h(39, 2),
    h(43, 1),
    h(47, 1),
    h(49, 1),
    h(55, 3),
  ],
  [
    ...vis([8, 10, 12, 22, 26, 36, 38, 40], 2),
    ...hid([9, 11, 15, 19, 29, 33, 37, 39], 3),
    h(24, 3, { switcher: 1 }),
  ],
  [
    ...hid([10, 16, 18, 22, 26], 3, "random"),
    h(24, 3, { switcher: 1 }),
    ...[28, 30, 32, 34].map((i) => h(i, 3)),
    ...[42, 44, 46, 48].map((i) => h(i, 2)),
    ...[56, 58, 60, 62].map((i) => h(i, 1)),
  ],
  [
    h(10, 3, { power: "ufo" }),
    h(24, 3, { power: "ufo" }),
    h(38, 3, { power: "ufo" }),
    h(44, 3),
    h(46, 3),
    h(50, 2),
    h(52, 3, { power: "missile" }),
    h(54, 2),
    h(56, 2),
    h(62, 2),
  ],
  [
    ...[3, 9, 11, 17].map((i) => h(i, 1, { power: "random" })),
    h(15, 2),
    h(19, 2),
    h(23, 2),
    h(25, 2),
    h(31, 1, { switcher: 1 }),
    h(49, 4),
    h(51, 2),
    h(53, 4),
    h(55, 2),
    ...hid([57, 59, 61], 3),
    h(63, 2),
    h(65, 4),
    h(67, 2),
    h(69, 4),
  ],
  [
    ...[0, 2, 4, 6, 14, 20, 28, 34, 42, 48, 56, 58, 60, 62].map((i) => h(i, 3)),
    ...vis([8, 10, 12, 22, 26, 36, 40, 50, 52, 54], 3).map((c) => ({
      ...c,
      hidden: true,
    })),
    ...[16, 18, 30, 32, 44, 46].map((i) => h(i, 4)),
    ...hid([23, 24, 25, 37, 38, 39], 1, "random"),
    h(31, 1, { switcher: 1 }),
  ],
  [
    ...[17, 23, 25, 29, 33, 37, 39, 45].map((i) => h(i, 4)),
    h(31, 1, { switcher: 1 }),
    ...[56, 58, 60, 62].map((i) => h(i, 2)),
    ...[64, 66, 68].map((i) => h(i, 3)),
    ...hid([84, 86, 88, 90, 92, 94, 96], 1, "random"),
  ],
];
