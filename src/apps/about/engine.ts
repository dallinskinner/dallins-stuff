/** One line of a reply: `say` is the character's dialogue, `act` is narration of what he does. */
export type Beat = { say: string } | { act: string }

export interface Reply {
  beats: Beat[]
  /** App path to open once the reply finishes, e.g. `projects`. */
  open?: string
  /** Flag to set once this reply plays, for later topics to check with `when`. */
  set?: string
}

/** A reply, or one built from what the visitor typed. */
export type ReplySource = Reply | ((input: string) => Reply)

export interface Topic {
  id: string
  /** Tested against the visitor's input, lowercased with punctuation stripped. */
  patterns: RegExp[]
  /** Only matches while this returns true. */
  when?: (state: ChatState) => boolean
  /** Played in order, one per time the topic matches. */
  replies: ReplySource[]
  /** Cycled once `replies` runs out; without it, the last reply repeats. */
  repeat?: ReplySource[]
}

/** One stop on the suggested path through the conversation. */
export interface GuideStep {
  topic: string
  /** Offered in order, one per time the topic has been asked, so a topic with several replies can be suggested several times. */
  prompts: string[]
}

export interface ChatState {
  /** How many times each topic has matched. */
  counts: Record<string, number>
  flags: string[]
}

export const initialState: ChatState = { counts: {}, flags: [] }

export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The first topic matching `input`, or `fallback`. */
export function matchTopic(input: string, state: ChatState, topics: Topic[], fallback: Topic): Topic {
  const text = normalize(input)
  return topics.find((t) => (!t.when || t.when(state)) && t.patterns.some((pattern) => pattern.test(text))) ?? fallback
}

/** Picks the topic matching `input`, and returns its next reply with the updated state. */
export function respond(
  input: string,
  state: ChatState,
  topics: Topic[],
  fallback: Topic,
): { reply: Reply; state: ChatState } {
  const topic = matchTopic(input, state, topics, fallback)

  const count = state.counts[topic.id] ?? 0
  const source =
    count < topic.replies.length
      ? topic.replies[count]
      : topic.repeat
        ? topic.repeat[(count - topic.replies.length) % topic.repeat.length]
        : topic.replies[topic.replies.length - 1]
  const reply = typeof source === 'function' ? source(input.trim()) : source

  return {
    reply,
    state: {
      counts: { ...state.counts, [topic.id]: count + 1 },
      flags: reply.set && !state.flags.includes(reply.set) ? [...state.flags, reply.set] : state.flags,
    },
  }
}

/** The next prompt along `guide`: the first step whose topic hasn't used up its prompts, skipping any
 *  prompt that wouldn't actually reach its topic right now (e.g. one gated behind a flag not yet set). */
export function nextSuggestion(state: ChatState, guide: GuideStep[], topics: Topic[], fallback: Topic): string | undefined {
  for (const step of guide) {
    const prompt = step.prompts[state.counts[step.topic] ?? 0]
    if (prompt && matchTopic(prompt, state, topics, fallback).id === step.topic) return prompt
  }
  return undefined
}
