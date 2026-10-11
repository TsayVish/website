// Character artwork, drawn as inline SVG on a shared 120×120 canvas.
// <Critter> draws the in-house animal cast; <CharacterArt> draws any kind
// of character a creator picks in the builder.

const INK = "var(--critter-ink)";
const S = { stroke: INK, strokeWidth: 3 } as const;
const BLUSH = "#FF6F9E";

export type PropKind = "sweat" | "leaf" | "sparkle" | "zz" | "band" | "bubble";
export type EarKind = "round" | "pointy" | "small" | "tiny" | "frog";
export type CharacterKind = "Person" | "Creature" | "Robot" | "Food" | "Object" | "Animal" | "Custom";

/* ---------- small accessories that carry a character's mood ---------- */

type Band = [x1: number, x2: number, y: number];

function Prop({ kind, band = [22, 98, 50], headTop = false }: { kind?: PropKind; band?: Band; headTop?: boolean }) {
  switch (kind) {
    case "band":
      return (
        <path
          d={`M${band[0]} ${band[2]} Q60 ${band[2] - 16} ${band[1]} ${band[2]}`}
          fill="none" stroke="#FF6F6F" strokeWidth={7} strokeLinecap="round"
        />
      );
    case "sweat":
      return <path d="M97 48 q5 8 0 11 q-5 -3 0 -11z" fill="#9CCBFF" stroke={INK} strokeWidth={2} />;
    case "leaf":
      return headTop ? (
        <path d="M60 34 q-3 -16 12 -20 q2 14 -12 20z" fill="#7BC98F" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      ) : (
        <path d="M88 30 q-3 -16 12 -20 q2 14 -12 20z" fill="#7BC98F" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      );
    case "sparkle":
      return (
        <path d="M99 28 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#FFD966" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      );
    case "zz":
      return (
        <g fontFamily="var(--mono), monospace" fontWeight={600} fill={INK}>
          <text x={93} y={37} fontSize={16}>z</text>
          <text x={103} y={25} fontSize={12}>z</text>
        </g>
      );
    case "bubble":
      return (
        <g>
          <rect x={85} y={12} width={30} height={20} rx={8} fill="#fff" stroke={INK} strokeWidth={2.5} />
          <circle cx={93} cy={22} r={2} fill={INK} />
          <circle cx={100} cy={22} r={2} fill={INK} />
          <circle cx={107} cy={22} r={2} fill={INK} />
        </g>
      );
    default:
      return null;
  }
}

/* ---------- a face: eyes, cheeks and mouth around a center line ---------- */

function Face({ cx, eyeY, cheekY, mouthY, sleepy }: { cx: number; eyeY: number; cheekY: number; mouthY: number; sleepy?: boolean }) {
  return (
    <g>
      {sleepy ? (
        <>
          <path d={`M${cx - 21} ${eyeY} q6 5 12 0`} fill="none" {...S} strokeLinecap="round" />
          <path d={`M${cx + 9} ${eyeY} q6 5 12 0`} fill="none" {...S} strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx={cx - 15} cy={eyeY} r={4.6} fill={INK} />
          <circle cx={cx + 15} cy={eyeY} r={4.6} fill={INK} />
          <circle cx={cx - 13.4} cy={eyeY - 1.6} r={1.6} fill="#fff" />
          <circle cx={cx + 16.6} cy={eyeY - 1.6} r={1.6} fill="#fff" />
        </>
      )}
      <ellipse cx={cx - 26} cy={cheekY} rx={7.5} ry={4.5} fill={BLUSH} opacity={0.5} />
      <ellipse cx={cx + 26} cy={cheekY} rx={7.5} ry={4.5} fill={BLUSH} opacity={0.5} />
      <path
        d={`M${cx - 7} ${mouthY} q3.5 4 7 0 q3.5 4 7 0`}
        fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
      />
    </g>
  );
}

/* ---------- the in-house animal cast ---------- */

export type CritterSpec = {
  name: string;
  species: string;
  body: string;
  ears: EarKind;
  shape?: "round" | "box";
  eyes?: "open" | "sleepy";
  prop?: PropKind;
};

export function Critter({ name, species, body, ears, shape = "round", eyes = "open", prop }: CritterSpec) {
  const isFrog = ears === "frog";
  const isBox = shape === "box";
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={`${name} the ${species.toLowerCase()}`}>
      {/* ears sit behind the body */}
      {ears === "round" && (
        <>
          <circle cx={28} cy={36} r={15} fill={body} {...S} />
          <circle cx={92} cy={36} r={15} fill={body} {...S} />
          <circle cx={28} cy={36} r={7} fill="#FF7FA8" opacity={0.45} />
          <circle cx={92} cy={36} r={7} fill="#FF7FA8" opacity={0.45} />
        </>
      )}
      {ears === "pointy" && (
        <>
          <path d="M22 56 L26 14 L54 36 Z" fill={body} {...S} strokeLinejoin="round" />
          <path d="M98 56 L94 14 L66 36 Z" fill={body} {...S} strokeLinejoin="round" />
        </>
      )}
      {ears === "small" && (
        <>
          <circle cx={36} cy={34} r={10} fill={body} {...S} />
          <circle cx={84} cy={34} r={10} fill={body} {...S} />
        </>
      )}
      {ears === "tiny" && (
        <>
          <circle cx={28} cy={44} r={7} fill={body} {...S} />
          <circle cx={92} cy={44} r={7} fill={body} {...S} />
        </>
      )}
      {isFrog && (
        <>
          <circle cx={38} cy={40} r={17} fill={body} {...S} />
          <circle cx={82} cy={40} r={17} fill={body} {...S} />
        </>
      )}

      {isBox ? (
        <rect x={14} y={34} width={92} height={74} rx={34} fill={body} {...S} />
      ) : (
        <ellipse cx={60} cy={72} rx={45} ry={38} fill={body} {...S} />
      )}
      <ellipse cx={60} cy={90} rx={25} ry={15} fill="#fff" opacity={0.42} />

      <Prop kind={prop} headTop />

      {isFrog ? (
        <>
          <circle cx={38} cy={38} r={9} fill="#fff" {...S} />
          <circle cx={82} cy={38} r={9} fill="#fff" {...S} />
          <circle cx={39} cy={39} r={4.2} fill={INK} />
          <circle cx={83} cy={39} r={4.2} fill={INK} />
          <Cheeks />
          <path d="M53 76 q3.5 4 7 0 q3.5 4 7 0" fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : isBox ? (
        <>
          <Eyes sleepy={eyes === "sleepy"} />
          <ellipse cx={60} cy={74} rx={9} ry={5} fill={INK} opacity={0.85} />
          <Cheeks />
          <path d="M55 82 q5 4 10 0" fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Eyes sleepy={eyes === "sleepy"} />
          <Cheeks />
          <path d="M53 76 q3.5 4 7 0 q3.5 4 7 0" fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

function Eyes({ sleepy }: { sleepy?: boolean }) {
  return sleepy ? (
    <>
      <path d="M39 66 q6 5 12 0" fill="none" {...S} strokeLinecap="round" />
      <path d="M69 66 q6 5 12 0" fill="none" {...S} strokeLinecap="round" />
    </>
  ) : (
    <>
      <circle cx={45} cy={65} r={4.6} fill={INK} />
      <circle cx={75} cy={65} r={4.6} fill={INK} />
      <circle cx={46.6} cy={63.4} r={1.6} fill="#fff" />
      <circle cx={76.6} cy={63.4} r={1.6} fill="#fff" />
    </>
  );
}

function Cheeks() {
  return (
    <>
      <ellipse cx={34} cy={77} rx={7.5} ry={4.5} fill={BLUSH} opacity={0.5} />
      <ellipse cx={86} cy={77} rx={7.5} ry={4.5} fill={BLUSH} opacity={0.5} />
    </>
  );
}

/* ---------- any kind of character, for the builder ---------- */

const BANDS: Record<CharacterKind, Band> = {
  Person: [28, 92, 46],
  Creature: [24, 96, 44],
  Robot: [18, 102, 40],
  Food: [24, 96, 48],
  Object: [22, 92, 44],
  Animal: [22, 98, 50],
  Custom: [22, 98, 50],
};

export type CharacterSpec = {
  name: string;
  kind: CharacterKind;
  color: string;
  prop?: PropKind;
  sleepy?: boolean;
};

export function CharacterArt({ name, kind, color, prop, sleepy }: CharacterSpec) {
  if (kind === "Custom") {
    // Placeholder shown until a picture is uploaded.
    return (
      <svg viewBox="0 0 120 120" role="img" aria-label={`${name}: no picture yet`}>
        <rect x={16} y={16} width={88} height={88} rx={20} fill={color} stroke={INK} strokeWidth={3} strokeDasharray="8 7" />
        <path d="M60 78V44M46 57l14-14 14 14" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M42 86h36" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "Animal") {
    return <Critter name={name} species="animal" body={color} ears="round" prop={prop} eyes={sleepy ? "sleepy" : "open"} />;
  }
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={`${name}, a ${kind.toLowerCase()} character`}>
      {kind === "Person" && <Person color={color} sleepy={sleepy} />}
      {kind === "Robot" && <Robot color={color} sleepy={sleepy} />}
      {kind === "Creature" && <Creature color={color} sleepy={sleepy} />}
      {kind === "Food" && <Cupcake color={color} sleepy={sleepy} />}
      {kind === "Object" && <Mug color={color} sleepy={sleepy} />}
      <Prop kind={prop} band={BANDS[kind]} />
    </svg>
  );
}

type Part = { color: string; sleepy?: boolean };

function Person({ color, sleepy }: Part) {
  return (
    <>
      <path d="M24 118 Q28 94 60 94 Q92 94 96 118Z" fill={color} {...S} />
      <circle cx={60} cy={62} r={33} fill="#F7D3BA" {...S} />
      <path
        d="M25 66 Q20 24 60 24 Q100 24 95 66 Q88 44 66 40 Q58 50 40 48 Q30 52 25 66Z"
        fill={color} {...S} strokeLinejoin="round"
      />
      <Face cx={60} eyeY={66} cheekY={76} mouthY={80} sleepy={sleepy} />
    </>
  );
}

function Robot({ color, sleepy }: Part) {
  const glow = "#8EDCB9";
  return (
    <>
      <line x1={60} y1={14} x2={60} y2={28} stroke={INK} strokeWidth={3} />
      <circle cx={60} cy={12} r={5} fill="#FFD966" {...S} />
      <rect x={10} y={52} width={10} height={24} rx={4} fill={color} {...S} />
      <rect x={100} y={52} width={10} height={24} rx={4} fill={color} {...S} />
      <rect x={44} y={96} width={32} height={18} rx={5} fill={color} {...S} />
      <rect x={18} y={28} width={84} height={70} rx={20} fill={color} {...S} />
      <rect x={29} y={42} width={62} height={44} rx={12} fill="#1B1B3A" />
      {sleepy ? (
        <>
          <path d="M39 62 q6 5 12 0" fill="none" stroke={glow} strokeWidth={3} strokeLinecap="round" />
          <path d="M69 62 q6 5 12 0" fill="none" stroke={glow} strokeWidth={3} strokeLinecap="round" />
        </>
      ) : (
        <>
          <rect x={40} y={55} width={9} height={12} rx={4.5} fill={glow} />
          <rect x={71} y={55} width={9} height={12} rx={4.5} fill={glow} />
        </>
      )}
      <path d="M53 75 q7 5 14 0" fill="none" stroke={glow} strokeWidth={2.5} strokeLinecap="round" />
      <ellipse cx={37} cy={74} rx={5} ry={3} fill={BLUSH} opacity={0.6} />
      <ellipse cx={83} cy={74} rx={5} ry={3} fill={BLUSH} opacity={0.6} />
    </>
  );
}

function Creature({ color, sleepy }: Part) {
  return (
    <>
      <path d="M38 36 L30 10 L52 30Z" fill="#FFD966" {...S} strokeLinejoin="round" />
      <path d="M82 36 L90 10 L68 30Z" fill="#FFD966" {...S} strokeLinejoin="round" />
      <path
        d="M16 106 Q12 52 32 36 Q60 16 88 36 Q108 52 104 106 Q96 98 88 106 Q80 98 72 106 Q64 98 56 106 Q48 98 40 106 Q32 98 24 106 Q20 100 16 106Z"
        fill={color} {...S} strokeLinejoin="round"
      />
      {sleepy ? (
        <path d="M48 58 q12 9 24 0" fill="none" {...S} strokeLinecap="round" />
      ) : (
        <>
          <circle cx={60} cy={56} r={14} fill="#fff" {...S} />
          <circle cx={62} cy={58} r={6} fill={INK} />
          <circle cx={64} cy={55} r={2} fill="#fff" />
        </>
      )}
      <path d="M46 80 q14 12 28 0" fill={INK} stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      <path d="M51 81 l3 5 3 -4z M63 81 l3 4 3 -5z" fill="#fff" />
      <ellipse cx={32} cy={74} rx={7} ry={4.2} fill={BLUSH} opacity={0.5} />
      <ellipse cx={88} cy={74} rx={7} ry={4.2} fill={BLUSH} opacity={0.5} />
    </>
  );
}

function Cupcake({ color, sleepy }: Part) {
  return (
    <>
      <path d="M28 74 L92 74 L84 110 L36 110Z" fill={color} {...S} strokeLinejoin="round" />
      <path d="M46 78 L48 108 M60 78 L60 108 M74 78 L72 108" stroke={INK} strokeWidth={2} opacity={0.35} />
      <path d="M20 76 Q12 54 34 50 Q34 28 60 28 Q86 28 86 50 Q108 54 100 76Z" fill="#FFF3F7" {...S} strokeLinejoin="round" />
      <circle cx={60} cy={22} r={7} fill="#FF6F6F" {...S} />
      <Face cx={60} eyeY={56} cheekY={64} mouthY={66} sleepy={sleepy} />
    </>
  );
}

function Mug({ color, sleepy }: Part) {
  const handle = "M88 52 q22 0 22 20 q0 20 -22 20";
  return (
    <>
      <path d="M44 26 q-6 -8 0 -16 M60 26 q-6 -8 0 -16 M76 26 q-6 -8 0 -16" fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" opacity={0.5} />
      <path d={handle} fill="none" stroke={INK} strokeWidth={13} strokeLinecap="round" />
      <path d={handle} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" />
      <rect x={20} y={32} width={72} height={78} rx={14} fill={color} {...S} />
      <rect x={20} y={32} width={72} height={12} rx={6} fill="#fff" opacity={0.35} />
      <Face cx={56} eyeY={64} cheekY={76} mouthY={80} sleepy={sleepy} />
    </>
  );
}

/** A character's picture: the uploaded image for Custom characters, otherwise the drawing. */
export function CharacterPicture(props: CharacterSpec & { imageUrl?: string | null }) {
  const { imageUrl, ...spec } = props;
  if (spec.kind === "Custom" && imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="char-img" src={imageUrl} alt={spec.name} loading="lazy" />;
  }
  return <CharacterArt {...spec} />;
}
