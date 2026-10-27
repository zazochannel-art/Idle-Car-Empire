// The push sender's work (index.ts runs it when called, every few minutes: docs/push.md):
// queue the notes for everyone (the cup's end, an event's start), take the notes waiting for
// phones in their day hours, send each through Firebase Cloud Messaging, and forget the phones
// Firebase says are gone. The database side is supabase/migrations/0016_push.sql.
//
// Plain TypeScript with fetch and Web Crypto only, so the game's tests run it in Node
// (src/lib/push-sender.test.ts) and Supabase runs it in Deno.

export type Lang = "en" | "ro" | "ru" | "es" | "pt" | "de";
export type Kind = "gift" | "invite" | "cup" | "event";

interface Texts {
  gift: [title: string, body: string, bodyNoName: string];
  invite: [title: string, body: string];
  cup: [title: string, body: string];
  event: string;
}

/** The notes' words; {name} is the player who sent the gift. */
export const TEXTS: Record<Lang, Texts> = {
  en: {
    gift: ["🎁 A gift for you", "{name} sent you a gift. Open the game to collect it.", "A player sent you a gift. Open the game to collect it."],
    invite: ["🤝 A friend joined", "A new player used your invite code. When they build their first car, your reward is ready."],
    cup: ["🏁 The weekly cup is over", "Your place is final: open the game to take your prize."],
    event: "The event has started. Don't miss it!",
  },
  ro: {
    gift: ["🎁 Un cadou pentru tine", "{name} ți-a trimis un cadou. Intră în joc să-l iei.", "Un jucător ți-a trimis un cadou. Intră în joc să-l iei."],
    invite: ["🤝 Un prieten s-a alăturat", "Un jucător nou ți-a folosit codul de invitație. Când își construiește prima mașină, recompensa ta e gata."],
    cup: ["🏁 Cupa săptămânii s-a încheiat", "Locul tău e stabilit: intră în joc să-ți iei premiul."],
    event: "Evenimentul a început. Nu-l rata!",
  },
  ru: {
    gift: ["🎁 Подарок для вас", "{name} отправляет вам подарок. Зайдите в игру, чтобы забрать его.", "Игрок отправил вам подарок. Зайдите в игру, чтобы забрать его."],
    invite: ["🤝 Друг присоединился", "Новый игрок использовал ваш код приглашения. Когда он построит первую машину, ваша награда будет готова."],
    cup: ["🏁 Кубок недели завершён", "Ваше место определено: зайдите в игру за призом."],
    event: "Событие началось. Не пропустите!",
  },
  es: {
    gift: ["🎁 Un regalo para ti", "{name} te ha enviado un regalo. Entra en el juego para recogerlo.", "Un jugador te ha enviado un regalo. Entra en el juego para recogerlo."],
    invite: ["🤝 Se ha unido un amigo", "Un jugador nuevo ha usado tu código de invitación. Cuando construya su primer coche, tu recompensa estará lista."],
    cup: ["🏁 La copa semanal ha terminado", "Tu puesto es definitivo: entra en el juego para recoger tu premio."],
    event: "El evento ha empezado. ¡No te lo pierdas!",
  },
  pt: {
    gift: ["🎁 Um presente para você", "{name} te enviou um presente. Abra o jogo para pegá-lo.", "Um jogador te enviou um presente. Abra o jogo para pegá-lo."],
    invite: ["🤝 Um amigo entrou", "Um jogador novo usou seu código de convite. Quando ele construir o primeiro carro, sua recompensa estará pronta."],
    cup: ["🏁 A copa da semana terminou", "Sua posição está definida: abra o jogo para pegar seu prêmio."],
    event: "O evento começou. Não perca!",
  },
  de: {
    gift: ["🎁 Ein Geschenk für dich", "{name} hat dir ein Geschenk geschickt. Öffne das Spiel, um es abzuholen.", "Ein Spieler hat dir ein Geschenk geschickt. Öffne das Spiel, um es abzuholen."],
    invite: ["🤝 Ein Freund ist dabei", "Ein neuer Spieler hat deinen Einladungscode benutzt. Sobald er sein erstes Auto baut, ist deine Belohnung bereit."],
    cup: ["🏁 Der Wochenpokal ist vorbei", "Deine Platzierung steht fest: Öffne das Spiel und hol dir deinen Preis."],
    event: "Das Event hat begonnen. Verpass es nicht!",
  },
};

/** The game's events (config/events.ts and the event.*.name texts; a test keeps them the same). */
export const EVENTS: Record<string, { emoji: string } & Record<Lang, string>> = {
  rushOrders: { emoji: "⚡", en: "Factory Week", ro: "Săptămâna fabricii", ru: "Неделя завода", es: "Semana de la fábrica", pt: "Semana da fábrica", de: "Werkswoche" },
  carShow: { emoji: "🎪", en: "International Car Show", ro: "Salonul auto internațional", ru: "Международный автосалон", es: "Salón Internacional del Automóvil", pt: "Salão Internacional do Automóvel", de: "Internationale Automobilausstellung" },
  steelSale: { emoji: "🏷️", en: "Steel Price Crash", ro: "Prăbușirea prețului oțelului", ru: "Обвал цен на сталь", es: "Desplome del precio del acero", pt: "Queda no preço do aço", de: "Stahlpreis-Absturz" },
  luxuryBoom: { emoji: "💎", en: "Luxury Boom", ro: "Boom-ul luxului", ru: "Бум роскоши", es: "Auge del lujo", pt: "Boom do luxo", de: "Luxusboom" },
  researchFair: { emoji: "🔬", en: "Engineering Fair", ro: "Târgul de inginerie", ru: "Инженерная ярмарка", es: "Feria de ingeniería", pt: "Feira de engenharia", de: "Ingenieursmesse" },
  exportDeal: { emoji: "🚢", en: "Export Deal", ro: "Contract de export", ru: "Экспортный контракт", es: "Acuerdo de exportación", pt: "Acordo de exportação", de: "Exportabkommen" },
  raceWeekend: { emoji: "🏁", en: "Race Weekend", ro: "Weekend de curse", ru: "Гоночный уик-энд", es: "Fin de semana de carreras", pt: "Fim de semana de corrida", de: "Rennwochenende" },
  electricWeek: { emoji: "🔋", en: "Electric Week", ro: "Săptămâna electrică", ru: "Электрическая неделя", es: "Semana eléctrica", pt: "Semana elétrica", de: "Elektro-Woche" },
};

const LANGS = Object.keys(TEXTS) as Lang[];
const asLang = (l: unknown): Lang => (LANGS.includes(l as Lang) ? (l as Lang) : "en");

/** A note's title and body in the phone's language (null: a kind or event this sender doesn't know). */
export function noteText(lang: unknown, kind: unknown, args: Record<string, unknown> = {}): { title: string; body: string } | null {
  const t = TEXTS[asLang(lang)];
  if (kind === "gift") {
    const name = typeof args.name === "string" ? args.name.trim().slice(0, 20) : "";
    return { title: t.gift[0], body: name ? t.gift[1].replace("{name}", name) : t.gift[2] };
  }
  if (kind === "invite") return { title: t.invite[0], body: t.invite[1] };
  if (kind === "cup") return { title: t.cup[0], body: t.cup[1] };
  if (kind === "event") {
    const e = typeof args.event === "string" ? EVENTS[args.event] : undefined;
    return e ? { title: `${e.emoji} ${e[asLang(lang)]}`, body: t.event } : null;
  }
  return null;
}

/** A Google service account key (Firebase console → Project settings → Service accounts). */
export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export function parseServiceAccount(json: string | undefined): ServiceAccount | null {
  if (!json) return null;
  try {
    const sa = JSON.parse(json) as Partial<ServiceAccount>;
    return typeof sa.project_id === "string" && typeof sa.client_email === "string" && typeof sa.private_key === "string" && sa.private_key.includes("PRIVATE KEY")
      ? { project_id: sa.project_id, client_email: sa.client_email, private_key: sa.private_key, token_uri: sa.token_uri }
      : null;
  } catch {
    return null;
  }
}

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlText = (text: string) => b64url(new TextEncoder().encode(text));

function pemBytes(pem: string): Uint8Array<ArrayBuffer> {
  const raw = atob(pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, ""));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Firebase Cloud Messaging's scope (the default); the purchases check (functions/iap) asks for Google Play's. */
export const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/** The signed request for an access token (RS256, an hour). */
export async function signedAssertion(sa: ServiceAccount, now: number, scope = FCM_SCOPE): Promise<string> {
  const iat = Math.floor(now / 1000);
  const head = b64urlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64urlText(
    JSON.stringify({ iss: sa.client_email, scope, aud: sa.token_uri ?? "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }),
  );
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claims}`)));
  return `${head}.${claims}.${b64url(sig)}`;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface Env {
  /** The project's API (SUPABASE_URL in an Edge Function). */
  supabaseUrl: string;
  /** The service key (SUPABASE_SERVICE_ROLE_KEY in an Edge Function): it never leaves the server. */
  serviceKey: string;
  /** FCM_SERVICE_ACCOUNT, the owner's secret: until it is set, nothing is sent. */
  serviceAccount?: string;
}

export interface Report {
  configured: boolean;
  /** Notes queued for everyone this time (the cup, an event). */
  queued: number;
  /** Notes waiting (only while Firebase isn't set up). */
  waiting?: number;
  sent: number;
  failed: number;
  forgotten: number;
  error?: string;
}

async function rpc<T>(env: Env, f: Fetch, name: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await f(`${env.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return (await res.json()) as T;
}

interface TakenNote {
  token: string;
  lang: string;
  kind: string;
  args: Record<string, unknown> | null;
}

/** Notes a run sends at most (the rest wait for the next run). */
export const BATCH = 200;
const AT_ONCE = 10;

/** One run: queue, take, send, forget. */
export async function runPush(env: Env, f: Fetch = fetch, now = Date.now()): Promise<Report> {
  const report: Report = { configured: false, queued: 0, sent: 0, failed: 0, forgotten: 0 };
  report.queued = await rpc<number>(env, f, "push_collect");
  const sa = parseServiceAccount(env.serviceAccount);
  if (!sa) {
    report.waiting = await rpc<number>(env, f, "push_waiting");
    if (env.serviceAccount) report.error = "FCM_SERVICE_ACCOUNT is not a service account key";
    return report;
  }
  report.configured = true;

  const tokenRes = await f(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${await signedAssertion(sa, now)}`,
  });
  const access = tokenRes.ok ? ((await tokenRes.json()) as { access_token?: string }).access_token : undefined;
  if (!access) {
    // nothing is taken: the notes wait for a run that can send them
    report.error = `access token: ${tokenRes.status}`;
    return report;
  }

  const notes = await rpc<TakenNote[]>(env, f, "push_take", { p_limit: BATCH });
  const gone: string[] = [];
  const send = async (n: TakenNote) => {
    const text = noteText(n.lang, n.kind, n.args ?? {});
    if (!text) return void report.failed++;
    const res = await f(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: n.token,
          notification: text,
          data: { kind: n.kind },
          // a newer note of the kind replaces the older; one not delivered in 12 hours is dropped
          android: { collapse_key: n.kind, ttl: "43200s", notification: { channel_id: "game", icon: "ic_stat_notify", tag: n.kind } },
        },
      }),
    }).catch(() => null);
    if (res?.ok) return void report.sent++;
    report.failed++;
    if (!res) return;
    // the phone uninstalled the game, or the token is not a phone's: forget it
    const err = (await res.json().catch(() => null)) as { error?: { status?: string; details?: { errorCode?: string }[] } } | null;
    const codes = [err?.error?.status, ...(err?.error?.details ?? []).map((d) => d.errorCode)];
    if (res.status === 404 || codes.includes("UNREGISTERED") || codes.includes("INVALID_ARGUMENT")) gone.push(n.token);
  };
  for (let i = 0; i < notes.length; i += AT_ONCE) await Promise.all(notes.slice(i, i + AT_ONCE).map(send));
  if (gone.length) report.forgotten = await rpc<number>(env, f, "push_forget", { p_tokens: gone });
  return report;
}
