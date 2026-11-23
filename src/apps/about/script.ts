import type { GuideStep, Reply, Topic } from './engine'

/** Topics are checked top to bottom and the first match wins, so put narrower topics above broader ones. */

export const opening: Reply = {
  beats: [
    { act: 'You are standing in the reception area of an office building. In front of you is a desk with a bell. You ring it.' },
    { act: "." },
    { act: ".." },
    { act: "..." },
    { act: "You hear a rustling of papers. A man emerges from the floor behind the desk. He squints as he looks toward you." },
    { say: "Can I help you?" },
    { act: "After asking you the question he looks around. You get the sense even though he emerged from the floor that this might be his first time here." },
  ],
}

const vomited = (state: { flags: string[] }) => state.flags.includes('vomited')

export const topics: Topic[] = [
  {
    id: 'are-you-dallin',
    patterns: [/\bare you (dallin|him|skinner)\b/, /\byou'?re dallin\b/],
    replies: [
        { beats: [{act: "He looks down at his shirt where a name tag should be. He ruffles his brow for a second then looks at you."}, { say: 'No. I don\'t think so.' }] },
      { beats: [{ say: "I just work here." }, { act: 'He adjusts his name tag so you can see it less.' }] },
    ],
    repeat: [{ beats: [{ act: 'He shakes his head without looking up.' }] }],
  },
  {
    id: 'name',
    patterns: [/\byour name\b/, /\bwho are you\b/, /\bwho r u\b/],
    replies: [
      {
        beats: [
          { say: 'Me? Oh, nobody. I just work here.' },
          { act: 'His name tag says HELLO MY NAME IS, followed by something scribbled out so hard the pen went through.' },
        ],
      },
    ],
    repeat: [
      { beats: [{ say: "Doesn't matter. I'm not the one you came to hear about." }] },
      { beats: [{ act: 'He covers his name tag with his hand.' }] },
    ],
  },
  {
    id: 'working-on',
    patterns: [/\bworking on\b/, /\bbeen up to\b/, /\bkeeping (you )?busy\b/],
    replies: [
      {
        beats: [
          { say: 'Oh, lately? A pixel art editor. Selections, dithered gradients, palettes...' },
          { act: "He's talking with his hands now. This is the most relaxed he's been." },
          { say: 'Here, look.' },
        ],
        open: 'tools/pixel-art',
      },
    ],
    repeat: [{ beats: [{ say: 'Same stuff. Little tools. You should poke around.' }] }],
  },
  {
    id: 'bio',
    patterns: [
      /\b(who|what)('?s| is| was)\b.*\b(dallin|skinner|he|him)\b/,
      /\babout (you|yourself|dallin|him|skinner)\b/,
      /\bwhat do (you|you guys|they|he) do\b/,
      /\b(job|career|resume|bio|occupation|living)\b/,
      /\b(dallin|skinner)\b/,
    ],
    replies: [
      {
        beats: [
          { say: 'Oh! Sure. Dallin Skinner is a design engin—' },
          { act: 'He swallows hard.' },
          { say: 'Excuse me. Dallin Skinner is a des—' },
          { act: 'He coughs into his elbow.' },
          { say: '...with some...' },
          { act: 'He blinks and shakes his head.' },
          { act: 'He stops talking and stares at a spot on the wall. He seems completely uninterested in your question.' },
        ],
      },
      {
        beats: [
          { say: 'Right. Sorry. From the top.' },
          { act: 'He straightens his collar and clears his throat.' },
          { say: 'Dallin Skinner is a—' },
          { act: 'He knocks over a glass of water. He watches it drip off the edge of the desk and does nothing about it.' },
        ],
      },
      {
        beats: [
          { say: 'Dallin Skin—' },
          { act: 'He goes pale.' },
          { act: 'He vomits onto the floor.' },
          { say: "I'm so sorry. That's never happened before." },
          { act: 'It has clearly happened before.' },
        ],
        set: 'vomited',
      },
      {
        beats: [
          { act: 'He looks at you, then at the floor, then back at you.' },
          { say: "Have you considered... looking at the projects? They're right there. They're very... they're right there." },
        ],
        open: 'projects',
      },
    ],
    repeat: [
      { beats: [{ act: "He picks up the phone and pretends to take a call. The phone isn't plugged in." }] },
      { beats: [{ say: 'Next question.' }] },
      { beats: [{ act: 'He puts on a pair of sunglasses. Indoors.' }] },
      { beats: [{ say: "He's— you know what, he's great. Ten out of ten." }, { act: 'He seems to think this counts.' }] },
    ],
  },
  {
    id: 'floor',
    when: vomited,
    patterns: [/\b(floor|vomit|puke|throw up|threw up|barf|mess|gross|smell)\b/],
    replies: [{ beats: [{ say: "We don't talk about the floor." }] }],
    repeat: [
      { beats: [{ act: "There's a wet-floor sign there now. You didn't see him put it out." }] },
      { beats: [{ act: 'He nudges a potted plant over the spot with his foot.' }] },
    ],
  },
  {
    id: 'floor-clean',
    patterns: [/\bfloor\b/],
    replies: [{ beats: [{ act: "It's a floor. Fairly clean, for now." }] }],
  },
  {
    id: 'are-you-ok',
    patterns: [/\bare you (ok|okay|alright|all right|sick|good|well)\b/, /\byou (ok|okay|good)\b/],
    replies: [{ beats: [{ say: "Me? I'm great. Totally fine." }, { act: 'A bead of sweat rolls down his temple.' }] }],
    repeat: [{ beats: [{ say: 'Never better.' }] }],
  },
  {
    id: 'site',
    patterns: [/\b(site|website|this place|desktop|windows?)\b/],
    replies: [
      {
        beats: [
          { say: "Oh, the site? It's great. Everything's a little window, you can drag them around. There's a pixel art thing, a palette thing..." },
          { act: 'He is visibly relaxed.' },
          { say: 'Somebody put a lot of work into it.' },
          { act: "He doesn't say who." },
        ],
      },
    ],
    repeat: [{ beats: [{ say: 'Click around! The folders open. That part I can tell you.' }] }],
  },
  {
    id: 'projects',
    patterns: [/\bprojects?\b/, /\bportfolio\b/, /\bwork\b/],
    replies: [{ beats: [{ say: 'Projects! Yes. Those I can do.' }, { act: 'He gestures grandly at nothing.' }], open: 'projects' }],
  },
  {
    id: 'contact',
    patterns: [/\b(contact|email|reach|hire|phone|linkedin|message)\b/],
    replies: [
      {
        beats: [{ say: 'You want to get in touch with— with him. Sure. That I can allow.' }],
        open: 'contact',
      },
    ],
  },
  {
    id: 'greeting',
    patterns: [/^(hi|hello|hey|howdy|yo|sup|hiya|greetings)\b/],
    replies: [{ beats: [{ say: 'Hi! Ask me anything.' }, { act: 'He immediately looks like he regrets saying "anything."' }] }],
    repeat: [{ beats: [{ say: 'Hi again.' }] }, { beats: [{ act: 'He waves.' }] }],
  },
  {
    id: 'help',
    patterns: [/\bhelp\b/, /\bwhat (can|should) i\b/, /\bhow does this work\b/],
    replies: [{ beats: [{ say: 'You can ask me anything!' }, { act: 'He says this the way people say "no pressure."' }] }],
  },
  {
    id: 'thanks',
    patterns: [/\b(thanks|thank you|thx|ty)\b/],
    replies: [{ beats: [{ say: 'No problem.' }, { act: "He looks relieved that you're winding down." }] }],
  },
  {
    id: 'bye',
    patterns: [/\b(bye|goodbye|see ya|later|cya|leaving)\b/],
    replies: [{ beats: [{ say: 'Oh. Okay! Bye!' }, { act: 'He waves for slightly too long.' }] }],
  },
]

export const fallback: Topic = {
  id: 'fallback',
  patterns: [],
  replies: [],
  repeat: [
    (input) => ({ beats: [{ act: `He nods slowly, as if "${input.length > 40 ? `${input.slice(0, 40)}...` : input}" was a complete sentence.` }] }),
    { beats: [{ act: 'He opens his mouth, closes it again, and nods.' }] },
    { beats: [{ say: 'Huh.' }, { act: "He writes something down. You catch a glimpse: it's a drawing of a duck." }] },
    { beats: [{ say: "Great question. I'll have to get back to you on that." }, { act: "He won't." }] },
    { beats: [{ say: 'Could you say that... differently?' }] },
  ],
}

/** The suggested path, offered as a Tab-to-fill placeholder. Visitors can ask anything out of order;
 *  the suggestion is always the first step here they haven't asked yet. */
export const guide: GuideStep[] = [
  { topic: 'are-you-dallin', prompts: ['Are you Dallin?'] },
  { topic: 'name', prompts: ["What's your name?"] },
  {
    topic: 'bio',
    prompts: ['Who is Dallin Skinner?', 'Sorry, who is Dallin?', "Let's try once more. Who is Dallin?", 'So... about Dallin?'],
  },
  { topic: 'floor', prompts: ['What about the mess on the floor?'] },
  { topic: 'are-you-ok', prompts: ['Are you okay?'] },
  { topic: 'working-on', prompts: ['What are you working on?'] },
  { topic: 'site', prompts: ["What's the deal with this website?"] },
  { topic: 'contact', prompts: ['How do I contact him?'] },
  { topic: 'bye', prompts: ['Bye!'] },
]
