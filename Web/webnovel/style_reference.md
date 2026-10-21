# WebNovel Forge — Style Reference (Internal)

*Derived from analysis of "Mercenary Harem In Murim Novel" (219 chapters, cultivation/harem/progression fantasy) — for Writer Agent prose rhythm reference only. No plot/character content reused.*

---

## 1. Sentence Length & Pacing Patterns

**Typical range:** 12–28 words per sentence in narration; dialogue sentences shorter (6–15 words).

**Action scenes:** Short, punchy sentences (8–15 words) for impact. Frequent sentence fragments for pacing.
> *Example:* "Three Poison Sect members immediately leaped at Leo. Green Qi moved like liquid around their weapons. Leo didn't move."

**Exposition/atmosphere:** Longer, flowing sentences (20–35 words) with subordinate clauses.
> *Example:* "The previously grand Heavenly Demon Palace was now in ruins, wreckage of broken walls and collapsed buildings everywhere, corpses of sect members scattered on the ground along with destroyed remnants of the battle."

**Internal monologue:** Medium length (15–25 words), often rhetorical questions or tactical assessments.

**Pattern:** Alternates 2–3 short action beats → 1 longer descriptive sentence → dialogue exchange → repeat. Creates "breathing room" rhythm typical of web novel serialization.

---

## 2. Chapter Openings & Endings (vs. Hook/Cliffhanger Skills in SKILLS.md)

### Openings (compare to **B1 Hook Skill** techniques)
| Chapter | Technique Used | Matches Skill Label |
|---------|---------------|---------------------|
| Ch. 1 | In-media-res dialogue + immediate stakes ("Okay, everyone listen up!") | **In-media-res action** |
| Ch. 3 | Atmospheric scene-setting (ruins, corpses, sensory details) | **Sensory/atmospheric hook** |
| Ch. 4 | Immediate action ("Three Poison Sect members immediately leaped...") | **In-media-res action** |
| Ch. 5 | Dialogue hook mid-transaction ("As promised, I will give you 500 Gold...") | **Intriguing dialogue** |
| Ch. 10 | Silence/tension beat ("Silence immediately fell upon the battleground...") | **Striking statement** |
| Ch. 101 | Atmospheric + disguise intrigue (carriage, false identities) | **Sensory/atmospheric + question** |

**Pattern:** 70% open with **action or dialogue in progress**, 30% with **atmospheric scene-setting**. Almost never open with pure exposition or summary.

### Endings (compare to **B2 Cliffhanger Skill** techniques)
| Chapter | Technique Used | Matches Skill Label |
|---------|---------------|---------------------|
| Ch. 1 | "Let's set Murim as a keyword..." — setup for next immediate goal | **Unanswered question / forward hook** |
| Ch. 3 | Enemy leader grins, prepares killing blow — POV character surrounded | **Sudden reversal / danger** |
| Ch. 5 | "But..." — Leo hints at switching sides if paid more | **Shocking reveal / moral ambiguity** |
| Ch. 10 | Leo observes Qi patterns, analyzing enemy — "There was something like a dim purple aura..." | **Intriguing observation / mystery seed** |
| Ch. 101 | "However, if one knew the truth, they would be shocked." — dramatic irony | **Dramatic irony / hidden stakes** |
| Ch. 201 | "Supreme Evil's remaining Qi is driving me mad... I shouldn't stay longer" — environmental threat + ticking clock | **Sudden danger / time pressure** |

**Pattern:** Every chapter ends on a **forward-looking beat** — either immediate physical danger, a revealed secret, a moral complication, or a new mystery. No chapter ends on pure resolution.

---

## 3. Dialogue Formatting & Tags

**Standard format:** Double quotes, new paragraph per speaker.

```text
"Okay, everyone listen up!" He raised his voice and called everyone's attention. "Our current situation is not normal."
```

**Tag patterns (frequency order):**
1. **Action beat + dialogue** (most common): `"Line." Character verbed. "Continuation."`
2. **Dialogue tag + action**: `Character said, "line," verbing.`
3. **Pure tag** (rare): `"Line," Character said.`
4. **No tag** (when 2 speakers, clear from context): 3–4 exchanges max before re-anchoring.

**Character voice differentiation (observed):**
- **Leo (MC):** Short sentences, modern contractions ("I'm", "we're"), tactical vocabulary, calm under pressure, dry humor. Never uses flowery honorifics.
- **Jessica:** Precise, professional, money-focused vocabulary ("As promised," "Please allow me to count"), formal politeness masking warmth.
- **Mok-Rang (Heavenly Demon):** Formal/archaic tone ("This old man," "Benefactors"), measured rhythm, switches to warmth with allies.
- **Villains:** Arrogant, threatening, or mocking — longer monologues when gloating.

**Internal monologue:** Italicized (in source HTML), present tense, distinct from narration voice.
> *'As long as I have this, I can reconstruct my base. What's important right now is to figure out our situation...'*

---

## 4. Typical Chapter Length

**Word count range (estimated from JSON sizes, excluding HTML tags):**
- **Early chapters (1–20):** ~1,800–2,500 words
- **Mid-volume (20–100):** ~2,500–3,500 words
- **Volume transitions (Ch. 101, 201):** ~3,500–4,500 words
- **Climax chapters:** ~4,000+ words

**Target for Writer Agent:** **2,000–3,500 words** per chapter (configurable per user setting). Web novel platforms favor consistent ~3k word chapters for daily/weekly serialization rhythm.

---

## 5. Recurring Structural Patterns

| Pattern | Frequency | Notes |
|---------|-----------|-------|
| **Single POV per chapter** (Leo) | ~85% | Occasional POV shifts to major ally (Mok-Rang, Jessica) for 1–2 scenes |
| **Scene breaks** | 3–6 per chapter | Marked by blank line + location/time shift; no *** or ### in source |
| **Action → Dialogue → Action → Reflection** loop | Per scene | Each scene averages 400–800 words |
| **Cultivation terminology integration** | Constant | Qi, Stars (1–9 Star ranking), Sects, Clans, Meridians, Dantian, Techniques — used naturally, not explained inline |
| **System/Modern knowledge contrast** | Ch. 1–10 heavy, then periodic | Leo's "Main Cube," "database," "keywords" vs. Murim terms — creates unique voice |
| **Harem/relationship beats** | Every 3–5 chapters | Light flirtation, banter, or emotional moment — not every chapter |
| **Mini-arc structure** | 5–15 chapters | Clear goal → complications → climax → reward/new hook |

---

## 6. Prose Rhythm Guidelines for Writer Agent

**Do:**
- Open chapters **in media res** or with **strong sensory anchor**
- Keep **paragraphs short** (1–4 sentences); web novels are read on phones
- Use **distinct voice fingerprints** for each speaking character (see SKILLS.md A5)
- End every chapter on a **forward hook** (danger, question, reveal, irony)
- Weave **cultivation terminology** into action, not exposition dumps
- Alternate **sentence length** deliberately: short for speed, long for weight

**Don't:**
- Open with weather/backstory summary
- End a chapter on "they went to sleep" or pure resolution
- Use generic dialogue tags ("he said," "she asked") without action beats
- Write dialogue that could be spoken by any character (check voice fingerprints)
- Let internal monologue ramble >3 sentences without external trigger

---

## 7. Comparison to SKILLS.md Hook/Cliffhanger Skills

| Skill | Novel's Natural Tendency | Writer Agent Should |
|-------|-------------------------|---------------------|
| **B1 Hook** | 70% action/dialogue opens, 30% atmospheric | Enforce variety across 5 techniques; don't default to action every time |
| **B2 Cliffhanger** | 100% chapters end on forward hook | Use the 3 techniques (reveal, question, reversal) deliberately; match next chapter's beat |

**Key insight:** The reference novel *already does* what the bonus skills formalize. The Writer Agent should produce drafts that *naturally* hit these beats; the Hook/Cliffhanger skills are for **polishing/alternatives**, not fixing missing basics.

---

*End of style reference. Writer Agent should treat this as "prose rhythm background" — same weight as world_bible.md for voice consistency, lower weight than outline beats for plot.*